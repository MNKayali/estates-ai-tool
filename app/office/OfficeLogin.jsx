'use client'

import { useRouter } from 'next/navigation'
import { AdminLogin } from '../admin/shared'

export default function OfficeLogin() {
  const router = useRouter()
  return <AdminLogin title="Enter your Projento office"
    description="Enter your existing admin code to unlock your private office."
    buttonLabel="Enter office" onSuccess={() => router.refresh()} />
}
