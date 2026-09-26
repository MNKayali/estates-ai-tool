/**
 * lib/users.js — user accounts, passwords and one-time links (server only).
 *
 * Anyone can sign up (email, password, optional name — createAccount), and the
 * admin can still invite someone (name + email → a one-time link to set their
 * own password). Everything lives in the same Vercel KV store as the reports:
 *
 *   user:<uid>              { uid, email, name, passwordHash, status, sessionVersion,
 *                             tier, createdAt, lastLoginAt, lastActiveAt }
 *   user:email:<email>      uid (email lower-cased)
 *   users:index             set of every uid
 *   user:<uid>:reports      hash reportId → report summary (lib/kv.js)
 *   token:<kind>:<sha256>   uid, with a TTL — invite (7 days) or reset (1 hour)
 *
 * status: 'invited' (no password yet) · 'active' · 'disabled'.
 * tier: 'free' for everyone — a field for later paid tiers, read by nothing.
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
import { deleteReport, userReportIds } from './kv.js'

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
    uid: u.uid, email: u.email, name: u.name, status: u.status, tier: u.tier || 'free',
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null,
    lastActiveAt: u.lastActiveAt || u.lastLoginAt || null,
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
export async function createUser({ email, name, passwordHash = null }) {
  const e = normaliseEmail(email)
  const uid = randomUUID().replace(/-/g, '').slice(0, 16)
  const claimed = await kv.set(`user:email:${e}`, uid, { nx: true })
  if (!claimed) throw new Error('exists')
  const now = new Date().toISOString()
  const user = {
    uid, email: e, name: String(name || '').trim().slice(0, 80),
    passwordHash, status: passwordHash ? 'active' : 'invited', sessionVersion: 0,
    tier: 'free', createdAt: now, lastLoginAt: passwordHash ? now : null,
  }
  await saveUser(user)
  await kv.sadd('users:index', uid)
  return user
}

/**
 * Public sign-up: an active account with its password set. Throws
 * `Error('exists')` for an email that already has an active or disabled
 * account.
 *
 * An invited account that never set a password (the admin's invite, from
 * before sign-up was public or since) is finished instead: same account, now
 * with this password. Otherwise its owner is stuck — sign-up says the email is
 * taken and sign-in has no password to check. This is no weaker than sign-up
 * itself, which does not verify email addresses either.
 */
export async function createAccount({ email, name, password }) {
  try {
    return await createUser({ email, name, passwordHash: await hashPassword(password) })
  } catch (e) {
    if (e.message !== 'exists') throw e
    const existing = await getUserByEmail(email)
    if (!existing || existing.passwordHash || existing.status !== 'invited') throw e
    const typedName = String(name || '').trim().slice(0, 80)
    if (!existing.name && typedName) await saveUser({ ...existing, name: typedName })
    return setPassword(existing.uid, password)
  }
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
  user.lastLoginAt = user.lastActiveAt = new Date().toISOString()
  await saveUser(user)
}

/** Stamp "last active" (a report was generated). Best effort. */
export async function recordActivity(uid) {
  try {
    const user = await getUser(uid)
    if (!user) return
    user.lastActiveAt = new Date().toISOString()
    await saveUser(user)
  } catch (e) {
    console.warn('[users] recordActivity skipped:', e.message)
  }
}

export const TIER_PATTERN = /^[a-z][a-z0-9-]{0,19}$/

/** Change a user's tier. A label only: nothing reads it yet. */
export async function setTier(uid, tier) {
  if (!TIER_PATTERN.test(String(tier || ''))) throw new Error('bad-tier')
  const user = await getUser(uid)
  if (!user) throw new Error('not-found')
  user.tier = tier
  return saveUser(user)
}

/**
 * Delete an account, its reports and its sign-in. Every session ends at once:
 * a cookie for a user who no longer exists never verifies (lib/auth.js).
 */
export async function deleteUser(uid) {
  const user = await getUser(uid)
  if (!user) throw new Error('not-found')
  const ids = await userReportIds(uid)
  for (const id of ids) await deleteReport(id, uid)
  await kv.del(`user:${uid}:reports`)
  await kv.del(`user:email:${normaliseEmail(user.email)}`)
  await kv.del(`user:${uid}`)
  await kv.srem('users:index', uid)
  return { reportsDeleted: ids.length }
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
