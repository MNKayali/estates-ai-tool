/**
 * POST /api/admin/login
 *
 * Validates the admin code and sets a 30-day httpOnly `estate_admin` cookie.
 * This route is intentionally public (it is how you authenticate as admin) and
 * is excluded from the admin gate in proxy.ts. Mirrors /api/check-access but
 * against ADMIN_CODE and a separate cookie, so admin access is distinct from the
 * colleague ACCESS_CODE.
 */
import { NextResponse } from 'next/server'
import { signAccessCode } from '@/lib/cookieAuth'

export async function POST(request) {
  try {
    const { code } = await request.json()
    const validCode = process.env.ADMIN_CODE

    // No admin code configured → dev mode, let through with a placeholder cookie.
    if (!validCode) {
      const res = NextResponse.json({ success: true })
      res.cookies.set('estate_admin', 'dev', {
        path: '/', httpOnly: true, sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      })
      return res
    }

    if (!code || String(code).trim() !== validCode) {
      // Small delay to slow brute-force guessing
      await new Promise(r => setTimeout(r, 600))
      return NextResponse.json({ error: 'Invalid admin code' }, { status: 401 })
    }

    const token = await signAccessCode(validCode)
    const res = NextResponse.json({ success: true })
    res.cookies.set('estate_admin', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
