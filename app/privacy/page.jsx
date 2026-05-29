/**
 * /privacy — Privacy Notice (UK GDPR)
 *
 * ⚠️ LEGAL REVIEW REQUIRED
 * This notice was drafted to accurately reflect the data flows in Estates AI Tool.
 * It must be reviewed by a Data Protection Officer or qualified solicitor before
 * you present the tool to any external party. Fill in all [PLACEHOLDER] values.
 *
 * Key third-party data processors to declare (already included below):
 *   • Anthropic API — project descriptions are sent to generate AI narrative
 *   • Vercel Inc.  — hosting and edge functions (processes all request data)
 *   • Upstash Inc. — Redis/KV storage for 90-day report persistence
 *
 * If your organisation is based outside the UK, or if users are EU data subjects,
 * review the international transfer provisions (UK GDPR Chapter V / SCCs).
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

function Table({ rows }) {
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

        {/* ── Legal review banner ── */}
        <div style={{ background: '#FEF9C3', border: '1px solid #D97706', borderRadius: '6px', padding: '14px 18px', marginBottom: '32px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#92400E', lineHeight: 1.6 }}>
            <strong>⚠️ Draft — DPO / solicitor review required.</strong> This notice describes data flows accurately but has not yet
            been reviewed by a Data Protection Officer or qualified solicitor. Fill in all [PLACEHOLDER] values before publishing.
          </p>
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
          Privacy Notice
        </h1>
        <p style={{ ...body, color: '#666', marginBottom: '32px' }}>
          Last reviewed: [DATE] &nbsp;|&nbsp; This notice applies to users of Estates AI Tool.
        </p>

        <Section title="1. Who is the data controller?">
          <p style={body}>
            <strong>[YOUR ORGANISATION NAME]</strong><br />
            <strong>[YOUR ORGANISATION ADDRESS]</strong><br />
            Data Protection contact: <a href="mailto:[DPO@YOURORGANISATION.COM]" style={{ color: BLUE }}>[DPO@YOURORGANISATION.COM]</a>
          </p>
          <p style={body}>
            [If applicable: We are registered with the Information Commissioner&apos;s Office (ICO) under registration number <strong>[ICO REGISTRATION NUMBER]</strong>.]
          </p>
        </Section>

        <Section title="2. What data do we collect and why?">
          <Table rows={[
            ['Data', 'Purpose', 'Legal basis'],
            [
              'Project questionnaire answers (project name, location, building type, size, budget, programme, scope description)',
              'Generating the feasibility report — these inputs drive the cost and programme calculations and are sent to the AI model to produce the narrative sections.',
              'Legitimate interests (internal planning and decision-making support)',
            ],
            [
              'Generated report content (cost estimate, programme, risk register, AI narrative)',
              'Storing the report for 90 days to allow team members to access a shared link.',
              'Legitimate interests',
            ],
            [
              'Access code entry (hashed cookie, no username)',
              'Controlling access to the tool. We do not store the code itself — only a session cookie.',
              'Legitimate interests (security)',
            ],
            [
              'Error logs (page URL, error message, browser type — no PII)',
              'Diagnosing technical faults via Sentry error tracking.',
              'Legitimate interests (system reliability)',
            ],
            [
              'Aggregated usage events (page views, download clicks — no PII, no cookies)',
              'Understanding how the tool is used to improve it. Collected via Vercel Analytics.',
              'Legitimate interests (product improvement)',
            ],
          ]} />
          <p style={{ ...body, color: '#C0392B', fontWeight: 600 }}>
            ⚠️ Important: do not enter personal data about individuals (names, emails, phone numbers, salaries) into the questionnaire fields.
            The tool is designed for project-level data only.
          </p>
        </Section>

        <Section title="3. Third-party processors">
          <p style={body}>
            To provide this tool we rely on the following sub-processors. Each is bound by data processing agreements and operates under
            adequate transfer mechanisms where applicable.
          </p>
          <Table rows={[
            ['Processor', 'Purpose', 'Data sent', 'Location'],
            [
              'Anthropic PBC',
              'AI narrative generation (executive summary, risk register, procurement recommendations)',
              'Project questionnaire answers and scope description. No personal data should be included — see §2.',
              'USA (Standard Contractual Clauses / UK IDTA)',
            ],
            [
              'Vercel Inc.',
              'Hosting, edge functions, Vercel Analytics (aggregated, cookie-free)',
              'HTTP request data (IP addresses are not stored); aggregated event counts.',
              'Global CDN; data stored in EU/UK regions where configured',
            ],
            [
              'Upstash Inc. (via Vercel KV)',
              'Storing generated report data for shared link access',
              'Full report payload (cost, programme, questionnaire answers — no personal data if users comply with §2)',
              'EU-West (London, lhr1)',
            ],
            [
              'Sentry Inc.',
              'Error monitoring and crash reporting',
              'Error messages, stack traces, page URL, browser type. Session replay is masked — no text content is captured.',
              'USA (Standard Contractual Clauses / UK IDTA)',
            ],
          ]} />
        </Section>

        <Section title="4. How long do we keep your data?">
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}><strong>Generated reports</strong> — automatically deleted from our database after <strong>90 days</strong>.</li>
            <li style={li}><strong>Access code cookie</strong> — session cookie; expires when you close your browser, or at most after 24 hours.</li>
            <li style={li}><strong>Error logs (Sentry)</strong> — retained for 90 days on Sentry&apos;s free tier, then deleted.</li>
            <li style={li}><strong>Analytics events (Vercel)</strong> — aggregated only; individual events are not stored with any identifier.</li>
          </ul>
        </Section>

        <Section title="5. Cookies and tracking">
          <p style={body}>
            This tool uses <strong>one first-party cookie</strong>: <code>estate_access</code>, a session cookie that stores your access
            authorisation for the duration of your session. It contains no personal data and is not used for advertising or tracking.
          </p>
          <p style={body}>
            Vercel Analytics collects aggregated, anonymised pageview and event data. It does <strong>not</strong> set cookies, does not
            track users across sites, and does not collect IP addresses. No consent banner is required for this type of analytics under
            UK PECR and the ICO&apos;s current guidance. [<em>Confirm this with your DPO for your specific context.</em>]
          </p>
        </Section>

        <Section title="6. Your rights under UK GDPR">
          <p style={body}>You have the right to:</p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}><strong>Access</strong> — request a copy of any personal data we hold about you.</li>
            <li style={li}><strong>Rectification</strong> — ask us to correct inaccurate data.</li>
            <li style={li}><strong>Erasure</strong> — ask us to delete data we no longer need.</li>
            <li style={li}><strong>Restriction</strong> — ask us to limit how we use your data while a query is resolved.</li>
            <li style={li}><strong>Portability</strong> — receive your data in a machine-readable format.</li>
            <li style={li}><strong>Object</strong> — object to processing based on legitimate interests.</li>
          </ul>
          <p style={body}>
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:[DPO@YOURORGANISATION.COM]" style={{ color: BLUE }}>[DPO@YOURORGANISATION.COM]</a>.
            We will respond within one calendar month.
          </p>
          <p style={body}>
            You also have the right to lodge a complaint with the{' '}
            <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>
              Information Commissioner&apos;s Office (ICO)
            </a>
            {' '}if you believe your data has been mishandled.
          </p>
        </Section>

        <Section title="7. Changes to this notice">
          <p style={body}>
            We may update this notice when our data practices change. The current version is always available at <code>/privacy</code>.
            Material changes will be communicated to authorised users.
          </p>
        </Section>

      </main>

      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>
          Estates AI Tool &nbsp;·&nbsp;
          <a href="/terms" style={{ color: '#2E75B6' }}>Terms of Use</a>
          &nbsp;·&nbsp;
          <a href="/access" style={{ color: '#2E75B6' }}>Return to tool</a>
        </p>
      </footer>

    </div>
  )
}
