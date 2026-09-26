/**
 * GET /api/auth/status — who is this browser: `{ user, trial, admin }`.
 *
 * Public. `user` is the signed-in account (publicUser) or null; `trial` is the
 * free-trial allowance `{ limit, used, remaining }` for a visitor who is not
 * signed in, or null for an account. A visitor without a trial cookie is given
 * one here (the questionnaire's proxy step normally already did). Used by the
 * landing page, the questionnaire ("2 of 3 free reports left") and the report
 * page (whether downloads need sign-up).
 */
import { NextResponse } from 'next/server'
import { getSessionUser, getTrialId, isAdminRequest } from '@/lib/auth'
import { publicUser } from '@/lib/users'
import { trialStatus, newTrialId, TRIAL_LIMIT } from '@/lib/trial'
import { TRIAL_COOKIE, TRIAL_MAX_AGE, createTrialToken, sessionCookieOptions } from '@/lib/session'

export async function GET(request) {
  const [user, admin] = await Promise.all([getSessionUser(request), isAdminRequest(request)])
  if (user) return NextResponse.json({ user: publicUser(user), trial: null, admin })

  let trialId = await getTrialId(request)
  let token = null
  if (!trialId) {
    trialId = newTrialId()
    token = await createTrialToken(trialId)
  }
  let trial
  try {
    trial = await trialStatus(token ? null : trialId)
  } catch {
    // KV unavailable: show the full allowance; generate-report is the real check.
    trial = { limit: TRIAL_LIMIT, used: 0, remaining: TRIAL_LIMIT }
  }
  const res = NextResponse.json({ user: null, trial, admin }, { headers: { 'Cache-Control': 'no-store' } })
  if (token) res.cookies.set(TRIAL_COOKIE, token, sessionCookieOptions(TRIAL_MAX_AGE))
  return res
}
