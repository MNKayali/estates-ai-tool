/**
 * /privacy — Privacy Notice (UK GDPR / Data Protection Act 2018)
 * Operator: Estates AI Tool
 * Last reviewed: 29 May 2026
 *
 * TODO: Add a contact email address to the "Your rights" section below.
 *       Search for "ADD-YOUR-EMAIL" and replace with your real address.
 */

const NAVY = '#1A2E4A'
const BLUE = '#2E75B6'

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, color: NAVY, borderBottom: '2px solid #E5E7EB', paddingBottom: '8px', marginBottom: '14px' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

const body = { fontSize: '14px', color: '#333', lineHeight: 1.8, margin: '0 0 10px' }
const li   = { fontSize: '14px', color: '#333', lineHeight: 1.7, marginBottom: '6px' }

function DataTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            {rows[0].map((h, i) => (
              <th key={i} style={{ padding: '8px 12px', background: NAVY, color: '#fff', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? '#F0F2F4' : '#fff', borderBottom: '1px solid #E5E7EB' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '8px 12px', verticalAlign: 'top', lineHeight: 1.6 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FC', fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <header style={{ background: NAVY, padding: '12px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '32px', height: '32px', background: BLUE, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '13px' }}>AI</div>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '16px' }}>Estates AI Tool</span>
          </a>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px 80px' }}>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
          Privacy Notice
        </h1>
        <p style={{ ...body, color: '#666', marginBottom: '32px' }}>
          Last reviewed: 29 May 2026 &nbsp;|&nbsp; This notice applies to all authorised users of Estates AI Tool.
        </p>

        <Section title="1. Who processes your data">
          <p style={body}>
            Estates AI Tool is an internal planning tool. The <strong>data controller</strong> is the
            organisation or individual who operates this instance of the tool and controls the access code.
            If you are an authorised user within an organisation, your data controller is that organisation.
          </p>
          <p style={body}>
            If your organisation is subject to UK GDPR (as most UK-based organisations are), the controller
            should be registered with the Information Commissioner&apos;s Office (ICO). Most organisations
            are already registered for their core activities — this tool falls within that scope. You can
            check registration requirements at{' '}
            <a href="https://ico.org.uk/registration" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>ico.org.uk/registration</a>.
          </p>
        </Section>

        <Section title="2. What data we collect and why">
          <DataTable rows={[
            ['Data collected', 'Why', 'Legal basis under UK GDPR'],
            [
              'Project questionnaire answers — project name, location, building type, size, budget range, programme constraints, scope description',
              'These drive the cost and programme calculations, and are passed to the AI model to generate the report narrative. Without them the tool cannot function.',
              'Legitimate interests: supporting internal estates planning and capital investment appraisal',
            ],
            [
              'Generated report content — cost estimate, programme table, risk register, AI narrative, report ID',
              'Stored for up to 90 days to allow the shareable report link to work. Without this, links would break immediately.',
              'Legitimate interests',
            ],
            [
              'Session cookie (estate_access) — a value confirming you have entered a valid access code',
              'Controlling who can access the tool. No personal information is stored in this cookie.',
              'Legitimate interests: security and access control',
            ],
            [
              'Error data — page URL, error message, browser type, approximate location (no name, email, or device ID)',
              'Diagnosing and fixing technical faults using Sentry error monitoring.',
              'Legitimate interests: maintaining a reliable service',
            ],
            [
              'Aggregated usage events — pages visited, download button clicks (no cookies, no personal identifiers)',
              'Understanding how the tool is used so we can improve it. Collected via Vercel Analytics.',
              'Legitimate interests: product improvement. No consent required under current ICO guidance as no tracking cookies are used.',
            ],
          ]} />
          <p style={{ ...body, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '12px 14px', color: '#991B1B' }}>
            <strong>Important:</strong> Do not enter personal data about identifiable individuals into the
            questionnaire fields. The tool is designed for project-level information only (building
            characteristics, costs, programme). If you inadvertently include someone&apos;s personal
            information (name, contact details, salary), please contact us to request deletion.
          </p>
        </Section>

        <Section title="3. Third-party services that process your data">
          <p style={body}>
            Running this tool requires three external services. Each processes a defined subset of your data:
          </p>
          <DataTable rows={[
            ['Service', 'What data is sent', 'Where data is held', 'Transfer mechanism'],
            [
              'Anthropic PBC — AI narrative generation',
              'Your project questionnaire answers are sent to Anthropic\'s API to generate the text sections of the report (executive summary, risk commentary, procurement recommendation). No personal data should be included — see §2.',
              'United States',
              'UK International Data Transfer Agreement (IDTA) / Standard Contractual Clauses. Anthropic\'s data processing terms apply.',
            ],
            [
              'Vercel Inc. — hosting, edge functions, and analytics',
              'All HTTP requests pass through Vercel\'s infrastructure. Vercel Analytics receives anonymised, aggregated event counts — no IP addresses are stored, no cookies are set.',
              'Global CDN; primary compute in EU/UK regions',
              'EU–US Data Privacy Framework. Vercel\'s DPA applies.',
            ],
            [
              'Upstash Inc. (via Vercel KV) — report storage',
              'The full generated report payload (cost figures, programme, questionnaire answers) is stored in an Upstash Redis database. This data is what makes the 90-day shareable report link work.',
              'EU-West, London (lhr1) — data does not leave the UK/EU',
              'No international transfer — data held in UK/EU region.',
            ],
            [
              'Sentry Inc. — error monitoring',
              'When an error occurs, Sentry receives the error message, a stack trace, the page URL, and your browser type. Session replay is enabled on errors only; all text fields are masked before transmission — Sentry never sees what you typed.',
              'United States',
              'UK IDTA / Standard Contractual Clauses. Sentry\'s DPA applies.',
            ],
          ]} />
        </Section>

        <Section title="4. How long we keep your data">
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}><strong>Generated reports</strong> — automatically and permanently deleted from the database after <strong>90 days</strong>. After this point the shareable link will no longer work.</li>
            <li style={li}><strong>Session cookie</strong> — deleted when you close your browser, or automatically after 24 hours.</li>
            <li style={li}><strong>Error logs (Sentry)</strong> — retained by Sentry for up to 90 days on our current plan, then deleted.</li>
            <li style={li}><strong>Analytics events (Vercel)</strong> — aggregated counts only; no individual event records are retained.</li>
          </ul>
        </Section>

        <Section title="5. Cookies">
          <p style={body}>
            This tool uses <strong>one cookie</strong>: <code style={{ background: '#F0F2F4', padding: '1px 5px', borderRadius: '3px' }}>estate_access</code>.
            This is a session cookie. It stores confirmation that you have entered a valid access code.
            It contains no personal information, expires when you close your browser, and is never
            used for advertising or cross-site tracking.
          </p>
          <p style={body}>
            Vercel Analytics does <strong>not</strong> set any cookies. No consent banner is required
            for this tool under UK PECR, because no tracking cookies or equivalent technologies
            are used.
          </p>
        </Section>

        <Section title="6. Your rights under UK GDPR">
          <p style={body}>You have the right to:</p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}><strong>Access</strong> — ask for a copy of personal data we hold about you.</li>
            <li style={li}><strong>Erasure</strong> — ask us to delete your data. For report data this happens automatically at 90 days, but we can delete earlier on request.</li>
            <li style={li}><strong>Rectification</strong> — ask us to correct inaccurate data.</li>
            <li style={li}><strong>Restriction</strong> — ask us to pause processing while a query is resolved.</li>
            <li style={li}><strong>Object</strong> — object to processing based on legitimate interests.</li>
          </ul>
          <p style={body}>
            To exercise any right, or to request deletion of a specific report before its 90-day expiry,
            contact us. {/* TODO: replace the line below with your real email address */}
          </p>
          <p style={{ ...body, background: '#EEF4FA', border: `1px solid ${BLUE}`, borderRadius: '4px', padding: '12px 14px' }}>
            <strong>Contact:</strong> Reach the tool operator via the access code holder for your organisation,
            or email{' '}
            <span style={{ fontFamily: 'monospace', background: '#DBEAFE', padding: '1px 6px', borderRadius: '3px' }}>
              [ADD-YOUR-EMAIL@HERE.COM]
            </span>.
            {/* ↑ Replace the placeholder above with your actual contact email, then delete this comment */}
          </p>
          <p style={body}>
            You also have the right to complain to the{' '}
            <a href="https://ico.org.uk/make-a-complaint" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>
              Information Commissioner&apos;s Office
            </a>{' '}
            if you believe your personal data has been mishandled.
          </p>
        </Section>

        <Section title="7. Changes to this notice">
          <p style={body}>
            This notice will be updated when data practices change. The current version is always
            at <code>/privacy</code>. The &ldquo;last reviewed&rdquo; date at the top of the page
            will be updated with each revision.
          </p>
        </Section>

      </main>

      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>
          Estates AI Tool &nbsp;·&nbsp;
          <a href="/terms" style={{ color: BLUE }}>Terms of Use</a>
          &nbsp;·&nbsp;
          <a href="/access" style={{ color: BLUE }}>Return to tool</a>
          &nbsp;·&nbsp; Last reviewed 29 May 2026
        </p>
      </footer>

    </div>
  )
}
