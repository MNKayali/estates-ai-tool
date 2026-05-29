/**
 * POST /api/check-access
 * Validates the access code and sets a 30-day httpOnly cookie.
 * This route is intentionally public (it is how you get authenticated).
 */
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { code } = await request.json()
    const validCode = process.env.ACCESS_CODE

    // No code configured → dev mode, let through
    if (!validCode) {
      const res = NextResponse.json({ success: true })
      res.cookies.set('estate_access', 'dev', {
        path: '/', httpOnly: true, sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      })
      return res
    }

    if (!code || String(code).trim() !== validCode) {
      // Small delay to slow brute-force guessing
      await new Promise(r => setTimeout(r, 600))
      return NextResponse.json({ error: 'Invalid access code' }, { status: 401 })
    }

    const res = NextResponse.json({ success: true })
    res.cookies.set('estate_access', validCode, {
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
