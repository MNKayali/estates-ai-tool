/**
 * The site-wide footer line: development status, how information is used, and
 * links to the Data and Disclaimer page, Privacy Notice and Terms. Used on the
 * home page, the questionnaire, My reports and the sign-in pages. Not on the
 * report itself — its A4 pages carry their own footer and disclaimer.
 */
import Link from 'next/link'
import { DATA_PAGE, FOOTER_NOTICE } from '@/lib/siteNotice'

const linkStyle = { color: 'var(--navy)', textDecoration: 'underline' }
const text = { fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6 }

/** The notice and its links, for a page that already has a footer of its own. */
export function SiteNotice({ align = 'center' }) {
  return (
    <div style={{ textAlign: align }}>
      <p style={{ ...text, margin: align === 'center' ? '0 auto' : 0, maxWidth: 760 }}>{FOOTER_NOTICE}</p>
      <p style={{ ...text, margin: '6px 0 0' }}>
        <Link href={DATA_PAGE.href} style={linkStyle}>{DATA_PAGE.label}</Link>
        {' · '}
        <Link href="/privacy" style={linkStyle}>Privacy</Link>
        {' · '}
        <Link href="/terms" style={linkStyle}>Terms</Link>
      </p>
    </div>
  )
}

export default function SiteFooter({ style }) {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: '18px 24px', ...style }}>
      <SiteNotice />
    </footer>
  )
}
