'use client'

import { useRouter } from 'next/navigation'
import { AdminLogin } from '../admin/shared'

export default function OfficeLogin() {
  const router = useRouter()
  return <AdminLogin onSuccess={() => router.refresh()} />
}
