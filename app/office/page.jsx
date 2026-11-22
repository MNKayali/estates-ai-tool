import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isOfficeOwner } from '@/lib/office/access'
import { getSessionUser } from '@/lib/auth'
import OfficeLogin from './OfficeLogin'
import Office from './Office'

export const metadata = {
  title: 'Projento Office',
  robots: { index: false, follow: false },
}

export default async function OfficePage() {
  const request = { cookies: await cookies() }
  const user = await getSessionUser(request)
  if (!user) redirect('/login?from=%2Foffice')
  if (user.email?.toLowerCase() !== process.env.OFFICE_OWNER_EMAIL?.trim().toLowerCase()) {
    return <main style={{ maxWidth: 640, margin: '5rem auto', padding: '2rem' }}>
      <h1>This office is private</h1>
      <p>Sign in with the owner’s designated account to enter.</p>
      <Link href="/login?from=%2Foffice">Sign in with another account</Link>
    </main>
  }
  if (!await isOfficeOwner(request)) return <OfficeLogin />
  return <Office />
}
