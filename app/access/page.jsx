import { redirect } from 'next/navigation'

// The shared access code was replaced by individual accounts (September 2026).
// Kept so old bookmarks and links land on the sign-in page.
export default async function AccessPage({ searchParams }) {
  const { from } = await searchParams
  redirect(typeof from === 'string' && from ? `/login?from=${encodeURIComponent(from)}` : '/login')
}
