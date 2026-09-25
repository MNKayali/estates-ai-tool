/**
 * lib/email.js — account emails (invite, password reset) through Resend.
 *
 * Plain fetch to the Resend API; no SDK dependency. Optional: with no
 * RESEND_API_KEY, emailEnabled() is false, sendEmail() returns false, and the
 * admin page shows each invite / reset link for the admin to pass on by hand.
 *
 * EMAIL_FROM must be an address on a domain verified in Resend, e.g.
 * "Projento <no-reply@projento.co.uk>".
 */
import { BRAND } from './reportStyle.js'

export function emailEnabled() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

/** Returns true when Resend accepted the message. Never throws. */
export async function sendEmail({ to, subject, text }) {
  if (!emailEnabled()) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
    })
    if (!res.ok) console.warn('[email] Resend refused the message:', res.status, (await res.text()).slice(0, 200))
    return res.ok
  } catch (e) {
    console.warn('[email] send failed:', e.message)
    return false
  }
}

/**
 * The site's own origin for links in emails. Server-controlled only — never
 * the request's Host header, which a caller could set to plant a link to
 * their own site in a real password-reset email.
 */
export function appOrigin() {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/+$/, '')
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function inviteEmail({ name, link }) {
  return {
    subject: `Your ${BRAND.name} account`,
    text: [
      `Hello${name ? ` ${name}` : ''},`,
      '',
      `You have been given an account for the ${BRAND.name} feasibility report tool.`,
      'Set your password here (the link works once and expires in 7 days):',
      '',
      link,
      '',
      'If you were not expecting this, you can ignore this email.',
    ].join('\n'),
  }
}

export function resetEmail({ name, link }) {
  return {
    subject: `Reset your ${BRAND.name} password`,
    text: [
      `Hello${name ? ` ${name}` : ''},`,
      '',
      `Someone asked to reset the password for your ${BRAND.name} account.`,
      'Choose a new password here (the link works once and expires in 1 hour):',
      '',
      link,
      '',
      'If this was not you, ignore this email — your password has not changed.',
    ].join('\n'),
  }
}
