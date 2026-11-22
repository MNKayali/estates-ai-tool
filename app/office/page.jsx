import { cookies } from 'next/headers'
import { isOfficeOwner } from '@/lib/office/access'
import OfficeLogin from './OfficeLogin'
import Office from './Office'

export const metadata = {
  title: 'Projento Office',
  robots: { index: false, follow: false },
}

export default async function OfficePage() {
  const session = await cookies()
  if (!await isOfficeOwner({ cookies: session })) return <OfficeLogin />
  return <Office />
}
