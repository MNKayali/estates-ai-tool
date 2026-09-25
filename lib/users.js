/**
 * lib/users.js — user accounts, passwords and one-time links (server only).
 *
 * Accounts are invite-only: the admin creates one (name + email), the person
 * receives a one-time link and sets their own password. Everything lives in the
 * same Vercel KV store as the reports:
 *
 *   user:<uid>              { uid, email, name, passwordHash, status, sessionVersion,
 *                             createdAt, lastLoginAt }
 *   user:email:<email>      uid (email lower-cased)
 *   users:index             set of every uid
 *   user:<uid>:reports      hash reportId → report summary (lib/kv.js)
 *   token:<kind>:<sha256>   uid, with a TTL — invite (7 days) or reset (1 hour)
 *
 * status: 'invited' (no password yet) · 'active' · 'disabled'.
 *
 * Unlike lib/kv.js, these functions do NOT swallow KV errors: an account
 * operation that silently did nothing would be worse than a clear failure. The
 * routes turn a thrown error into a 503.
 *
 * Passwords: scrypt (node:crypto, N=2^15, r=8, p=1, 16-byte salt, 64-byte key),
 * stored as `scrypt$N$r$p$<salt b64>$<hash b64>` so the cost can be raised later
 * without breaking existing hashes. Link tokens are 32 random bytes; only their
 * SHA-256 is stored, so a KV dump does not contain usable links.
 */
import { kv } from '@vercel/kv'
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLen: 64 }
const SCRYPT_MAXMEM = 64 * 1024 * 1024

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 200
export const TOKEN_TTL = { invite: 60 * 60 * 24 * 7, reset: 60 * 60 }

// ─── Validation ───────────────────────────────────────────────────────────────

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

/** Returns an error message, or '' when the password is acceptable. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters.`
  }
  if (password.length > PASSWORD_MAX) return `Use no more than ${PASSWORD_MAX} characters.`
  return ''
}

// ─── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  try {
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM,
    })
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

// A hash that never matches, checked when the email is unknown so a login
// attempt takes the same time whether or not the account exists.
let dummyHash = null
export async function burnPasswordCheck(password) {
  if (!dummyHash) dummyHash = await hashPassword(randomBytes(12).toString('hex'))
  await verifyPassword(String(password || ''), dummyHash)
  return false
}

// ─── Accounts ────────────────────────────────────────────────────────────────

/** The fields safe to send to a browser. */
export function publicUser(u) {
  if (!u) return null
  return {
    uid: u.uid, email: u.email, name: u.name, status: u.status,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null,
  }
}

export async function getUser(uid) {
  if (!uid) return null
  return (await kv.get(`user:${uid}`)) || null
}

export async function getUserByEmail(email) {
  const uid = await kv.get(`user:email:${normaliseEmail(email)}`)
  return uid ? getUser(uid) : null
}

async function saveUser(user) {
  await kv.set(`user:${user.uid}`, user)
  return user
}

/**
 * Create an invited account. Throws `Error('exists')` if the email already has
 * one. The email claim uses `nx`, so two simultaneous invites for the same
 * address cannot both succeed.
 */
export async function createUser({ email, name }) {
  const e = normaliseEmail(email)
  const uid = randomUUID().replace(/-/g, '').slice(0, 16)
  const claimed = await kv.set(`user:email:${e}`, uid, { nx: true })
  if (!claimed) throw new Error('exists')
  const user = {
    uid, email: e, name: String(name || '').trim().slice(0, 80),
    passwordHash: null, status: 'invited', sessionVersion: 0,
    createdAt: new Date().toISOString(), lastLoginAt: null,
  }
  await saveUser(user)
  await kv.sadd('users:index', uid)
  return user
}

export async function listUsers() {
  const uids = (await kv.smembers('users:index')) || []
  const users = await Promise.all(uids.map(getUser))
  return users.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

/**
 * Set a new password, activate the account and sign out every other session
 * (sessionVersion + 1). Returns the updated user.
 */
export async function setPassword(uid, password) {
  const user = await getUser(uid)
  if (!user) throw new Error('not-found')
  user.passwordHash = await hashPassword(password)
  user.sessionVersion = (user.sessionVersion || 0) + 1
  if (user.status !== 'disabled') user.status = 'active'
  return saveUser(user)
}

/** 'disable' signs the user out everywhere; 'enable' restores the previous state. */
export async function setDisabled(uid, disabled) {
  const user = await getUser(uid)
  if (!user) throw new Error('not-found')
  if (disabled) {
    user.status = 'disabled'
    user.sessionVersion = (user.sessionVersion || 0) + 1
  } else {
    user.status = user.passwordHash ? 'active' : 'invited'
  }
  return saveUser(user)
}

export async function recordLogin(uid) {
  const user = await getUser(uid)
  if (!user) return
  user.lastLoginAt = new Date().toISOString()
  await saveUser(user)
}

// ─── One-time links ───────────────────────────────────────────────────────────

const sha256 = s => createHash('sha256').update(s).digest('hex')

/** Issue a one-time token for `kind` ('invite' | 'reset'). Returns the raw token. */
export async function createLinkToken(kind, uid) {
  if (!TOKEN_TTL[kind]) throw new Error(`unknown token kind ${kind}`)
  const raw = randomBytes(32).toString('hex')
  await kv.set(`token:${kind}:${sha256(raw)}`, uid, { ex: TOKEN_TTL[kind] })
  return raw
}

/** The uid a token belongs to, without using it up (to validate the page). */
export async function peekLinkToken(kind, raw) {
  if (!TOKEN_TTL[kind] || !/^[0-9a-f]{64}$/.test(String(raw || ''))) return null
  return (await kv.get(`token:${kind}:${sha256(raw)}`)) || null
}

/** Use a token up. Returns its uid, or null if it is unknown, expired or already used. */
export async function consumeLinkToken(kind, raw) {
  if (!TOKEN_TTL[kind] || !/^[0-9a-f]{64}$/.test(String(raw || ''))) return null
  return (await kv.getdel(`token:${kind}:${sha256(raw)}`)) || null
}
