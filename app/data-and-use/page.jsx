/**
 * /data-and-use — the short, plain-English Data and Disclaimer page (owner's
 * wording, 29 September 2026). Public. It summarises how information is used
 * and what a report is; the Privacy Notice (/privacy) keeps the full detail the
 * law asks for, and the Terms of Use (/terms) incorporate this page.
 */
import Link from 'next/link'
import Logo from '../components/Logo'
import SiteFooter from '../components/SiteFooter'
import { BRAND } from '@/lib/brand'
import { DATA_PAGE, DATA_PAGE_UPDATED } from '@/lib/siteNotice'

export const metadata = {
  title: `${DATA_PAGE.label} — ${BRAND.name}`,
  description: `How ${BRAND.name} uses your information, and what its reports are and are not.`,
}

const body = { fontSize: 15, color: 'var(--text)', lineHeight: 1.75, margin: '0 0 10px' }
const li = { fontSize: 15, color: 'var(--text)', lineHeight: 1.7, marginBottom: 4 }
const link = { color: 'var(--navy)', textDecoration: 'underline' }

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  )
}

export default function DataAndUsePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>
      <header style={{ background: 'var(--navy)', padding: '12px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center' }}>
          <Link href="/" aria-label={`${BRAND.name} home`} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Logo variant="white" height={24} compactBelow360 />
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 56px' }}>
        <div className="eyebrow">{DATA_PAGE.label}</div>
        <h1 style={{ fontSize: 30, color: 'var(--ink)', margin: '8px 0 6px' }}>Using {BRAND.name}</h1>
        <p style={{ ...body, color: 'var(--text-mute)', fontSize: 13, marginBottom: 32 }}>Last updated: {DATA_PAGE_UPDATED}</p>

        <Section title="A tool in development">
          <p style={body}>
            {BRAND.name} is under active research and development. Features, rates, methods and outputs may
            change or be withdrawn without notice, and reports produced today may differ from those produced
            later for the same project.
          </p>
        </Section>

        <Section title="How we use your information">
          <p style={body}>
            The information you enter and the reports you create are stored so you can reopen them, and are
            used <strong>only within {BRAND.name}</strong> to produce your reports and to develop and improve
            the tool. We do not sell, publish or share your information for marketing or any other purpose.
            The only access outside our team is by the service providers that host and run the tool, and only
            under contract, on our instructions and for that purpose. Information used for development is
            anonymised first, so that it does not identify you, your organisation or your project.
          </p>
        </Section>

        <Section title="Keeping it confidential">
          <p style={body}>
            Your reports are visible only to you and to {BRAND.name}&apos;s administrator. We take reasonable
            technical and organisational steps to protect your information, but no online service can be
            guaranteed completely secure.
          </p>
        </Section>

        <Section title="What you should not enter">
          <p style={body}>Do not enter:</p>
          <ul style={{ paddingLeft: 20, margin: '0 0 10px' }}>
            <li style={li}>personal details about individuals;</li>
            <li style={li}>information you are not authorised to share;</li>
            <li style={li}>anything your organisation classes as strictly confidential.</li>
          </ul>
        </Section>

        <Section title="Your control">
          <p style={body}>
            You can delete any report at any time from{' '}
            <Link href="/reports" style={link}>My reports</Link>. To close your account and remove all your
            data, email <a href={`mailto:${BRAND.email}`} style={link}>{BRAND.email}</a>. Full details are in
            our <Link href="/privacy" style={link}>Privacy Notice</Link>.
          </p>
        </Section>

        <Section title="Reports are indicative only">
          <p style={body}>
            Reports are produced at RIBA Stage 0–1 from benchmark data and the answers you give. They are:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 10px' }}>
            <li style={li}>not a cost plan, valuation or professional advice;</li>
            <li style={li}>
              not to be relied on for a financial, contractual or procurement decision without review by a
              suitably qualified professional, such as a Chartered Quantity Surveyor.
            </li>
          </ul>
          <p style={body}>
            You are responsible for checking that the information you enter is accurate and for how you use
            the outputs.
          </p>
        </Section>

        <Section title="Liability">
          <p style={body}>
            {BRAND.name} is provided &ldquo;as is&rdquo;. To the fullest extent permitted by law, we accept no
            liability for any loss arising from use of, or reliance on, the tool or its reports. This page
            forms part of our <Link href="/terms" style={link}>Terms of Use</Link>.
          </p>
        </Section>
      </main>

      <SiteFooter />
    </div>
  )
}
