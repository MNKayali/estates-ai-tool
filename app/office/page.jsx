import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { isOfficeOwner } from '@/lib/office/access'
import { SESSION_COOKIE } from '@/lib/session'
import Office from './Office'

export const metadata = {
  title: 'Projento Office',
  robots: { index: false, follow: false },
}

export default async function OfficePage() {
  const session = await cookies()
  if (!session.has(SESSION_COOKIE)) redirect('/login?from=%2Foffice')
  if (!await isOfficeOwner({ cookies: session })) notFound()
  return <Office />
}
