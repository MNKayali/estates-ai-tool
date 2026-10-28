/**
 * /privacy — Privacy Notice (UK GDPR / Data Protection Act 2018)
 * Operator: Projento
 * Last reviewed: 28 October 2026
 * Contact email: BRAND.email (lib/brand.js), the same address the report's contact card shows.
 */
import Link from 'next/link'
import Logo from '../components/Logo'
import { BRAND } from '@/lib/brand'
import { DATA_PAGE } from '@/lib/siteNotice'

const NAVY = '#1A2E4A'
const BLUE = '#A86F12'   // brand accent (deep amber) — name kept to avoid churn

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
          <Link href="/" aria-label={`${BRAND.name} home`} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Logo variant="white" height={24} />
          </Link>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px 80px' }}>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
          Privacy Notice
        </h1>
        <p style={{ ...body, color: '#666', marginBottom: '32px' }}>
          Last reviewed: 28 October 2026 &nbsp;|&nbsp; This notice applies to everyone who uses {BRAND.name}: visitors trying it free, and account holders.
        </p>
        <p style={{ ...body, background: '#F8F1E2', border: `1px solid ${BLUE}`, borderRadius: '4px', padding: '12px 14px', marginBottom: '32px' }}>
          {BRAND.name} is in research and development. The information you enter and the reports you create are
          used only within {BRAND.name}, to produce your reports and to develop and improve the tool, and are not
          sold or shared with third parties. A short summary is on our{' '}
          <a href={DATA_PAGE.href} style={{ color: NAVY, fontWeight: 600 }}>{DATA_PAGE.label}</a> page; the full detail follows.
        </p>

        <Section title="1. Who processes your data">
          <p style={body}>
            {BRAND.name} is a free, non-commercial feasibility-reporting tool for capital projects, run from
            England as a research and development project. You can try it free without an account, and
            anyone aged 18 or over can create a free account.
          </p>
          <p style={body}>
            The <strong>data controller</strong> is the operator of {BRAND.name} (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;). For anything about your data, contact us at{' '}
            <a href={`mailto:${BRAND.email}`} style={{ color: NAVY, fontWeight: 600 }}>{BRAND.email}</a>.
            We do not have a data protection officer; questions are answered directly by the operator.
          </p>
        </Section>

        <Section title="2. What data we collect and why">
          <DataTable rows={[
            ['Data collected', 'Why', 'Legal basis under UK GDPR'],
            [
              'Project questionnaire answers — project name, location, building type, size, budget range, programme constraints, scope description',
              'These drive the cost and programme calculations, and are passed to our text-drafting service provider (see §3) to draft the written sections of the report. Without them the tool cannot function.',
              'Contract: producing the report you ask for. Legitimate interests (free-trial visitors): providing the report requested',
            ],
            [
              'Account details — your email address (your login), your name if you give it, a one-way hash of your password (not the password itself), account status and tier, and the dates you joined, last signed in and last generated a report',
              'Creating your account, signing you in, showing you your own reports, sending account emails (such as invitations and password resets) and telling you about significant changes to our terms.',
              'Contract: providing the account you asked for. Legitimate interests: security and access control',
            ],
            [
              'Generated report content — cost estimate, programme table, risk register, written sections, questionnaire answers, report ID, linked to your account or to your free-trial visitor ID',
              'Kept so you can reopen and download your reports from “My reports”. Only you (and the tool administrator) can open them.',
              'Contract / legitimate interests',
            ],
            [
              'Free-trial visitor ID — a random identifier in a cookie (projento_trial), the number of free reports used with it, and the IDs of those reports',
              'Counting free reports (three per visitor) and, if you then sign up or sign in, moving the reports you made into your account.',
              'Legitimate interests: operating a fair free trial',
            ],
            [
              'Network address, stored only in a keyed one-way hashed form (not the address itself)',
              'A backstop count of free reports per network over 30 days, so the free trial cannot be reset simply by clearing cookies.',
              'Legitimate interests: preventing abuse of the free trial',
            ],
            [
              'Session cookie (projento_session) — a signed value identifying your account',
              'Keeping you signed in. It contains an account reference, not your name, email or password.',
              'Legitimate interests: security and access control',
            ],
            [
              'Usage data — how many reports are generated each week, sign-ups, and how many free-trial visitors go on to create an account; and the project information in reports, used in anonymised and aggregated form',
              'Developing and improving the tool, for use within Projento only. Information used for development is anonymised and aggregated first, so that it does not identify you, your organisation or an individual project. It is not sold or shared with third parties.',
              'Legitimate interests: developing and improving the tool',
            ],
            [
              'Feedback you send from a report — your message, its category, the report ID, the project name and the page address',
              'Following up on the problem you reported and improving the tool.',
              'Legitimate interests: product improvement',
            ],
            [
              'Error data — page URL, error message, browser type, approximate location (no name, email, or device ID)',
              'Diagnosing and fixing technical faults using Sentry error monitoring.',
              'Legitimate interests: maintaining a reliable service',
            ],
            [
              'Visit counts — the pages you view, how long each is on screen, the site or campaign link that brought you, your country and device type. You are counted by a one-way code made from your network address, browser type and the date; the code changes every day and your network address is not stored. If you create an account, the source of that day’s visit (for example “Google” or “LinkedIn”) is saved with it.',
              'Knowing how many people use the tool, how they find it and where they stop, so we can improve it.',
              'Legitimate interests: product improvement. Nothing is stored on your device.',
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
            Running this tool requires the external services below. Each processes a defined subset of your data:
          </p>
          <DataTable rows={[
            ['Service', 'What data is sent', 'Where data is held', 'Transfer mechanism'],
            [
              'Anthropic PBC — drafting of the report\'s written sections',
              'Your project questionnaire answers are sent to Anthropic\'s API to generate the text sections of the report (executive summary, risk commentary, procurement suggestion). No personal data should be included — see §2.',
              'United States',
              'Standard Contractual Clauses with the UK Addendum, under Anthropic\'s Data Processing Addendum. Under Anthropic\'s commercial terms, data sent through its API is not used to train its models.',
            ],
            [
              'Vercel Inc. — hosting, edge functions, and analytics',
              'All requests pass through Vercel\'s infrastructure, including your questionnaire answers while a report is produced. Vercel Analytics receives anonymised, aggregated event counts — no cookies are set.',
              'Global network; server processing may take place in the United States',
              'EU–US Data Privacy Framework (UK Extension) and Standard Contractual Clauses with the UK Addendum. Vercel\'s DPA applies.',
            ],
            [
              'Upstash Inc. (via Vercel KV) — report storage',
              'Your account details, your generated reports (cost figures, programme, questionnaire answers), the free-trial counts and the weekly usage counts are stored in an Upstash Redis database.',
              'The data region chosen for our database; Upstash may access it from the United States for support',
              'Standard Contractual Clauses with the UK Addendum. Upstash\'s DPA applies.',
            ],
            [
              'Resend Inc. — account emails',
              'Your name, your email address, and the text of the invitation or password-reset email sent to you.',
              'United States',
              'UK IDTA / Standard Contractual Clauses. Resend\'s DPA applies.',
            ],
            [
              'Sentry Inc. — error monitoring',
              'When an error occurs, Sentry receives the error message, a stack trace, the page URL, and your browser type. Session replay is enabled on errors only; all text fields are masked before transmission — Sentry does not see what you typed. Passwords, email addresses and questionnaire answers are removed before an error is sent.',
              'European Union (Sentry\'s EU data region)',
              'Stored in the EU. Any access from the United States is covered by Sentry\'s DPA and Standard Contractual Clauses with the UK Addendum.',
            ],
          ]} />
        </Section>

        <Section title="4. How long we keep your data">
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}><strong>Reports in your account</strong> — kept until you delete them from “My reports”, or until your account is closed. Deletion is immediate and permanent.</li>
            <li style={li}><strong>Free-trial reports</strong> — deleted automatically 90 days after they were generated, unless you create an account or sign in on the same browser first, in which case they move into your account and are kept like any other report. Reports created before accounts were introduced are also deleted 90 days after they were generated.</li>
            <li style={li}><strong>Account details</strong> — kept while your account exists. Delete your account yourself from “My reports” (or ask us to): the account, all its reports and every signed-in session are deleted at once.</li>
            <li style={li}><strong>Free-trial count</strong> — the visitor ID and its count of free reports are kept for one year; the hashed network count for 30 days.</li>
            <li style={li}><strong>Invitation and reset links</strong> — expire after 7 days and 1 hour respectively, and work only once.</li>
            <li style={li}><strong>Session cookie</strong> — expires 30 days after you sign in, or when you sign out. The free-trial cookie expires after one year.</li>
            <li style={li}><strong>Error logs (Sentry)</strong> — retained by Sentry for up to 90 days on our current plan, then deleted.</li>
            <li style={li}><strong>Analytics events (Vercel)</strong> — aggregated counts only; no individual event records are retained.</li>
            <li style={li}><strong>Visit counts</strong> — daily totals kept for about 13 months; the daily visitor code is used only for counting and the source of a visit is kept for 2 days (or with your account, if you create one that day).</li>
          </ul>
        </Section>

        <Section title="5. Cookies">
          <p style={body}>
            This tool uses <strong>two cookies</strong>, neither of them for advertising or cross-site tracking:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}><code style={{ background: '#F0F2F4', padding: '1px 5px', borderRadius: '3px' }}>projento_session</code> — keeps you signed in. It contains a signed account reference (not your name, email or password) and expires after 30 days or when you sign out.</li>
            <li style={li}><code style={{ background: '#F0F2F4', padding: '1px 5px', borderRadius: '3px' }}>projento_trial</code> — set when you start the questionnaire without an account. It holds a random visitor ID so the free trial can count your reports and keep them yours; it expires after one year.</li>
          </ul>
          <p style={body}>
            Both are strictly necessary for the service you asked for, so no consent is required.
            The administrator&apos;s area uses a third cookie of the same kind, <code style={{ background: '#F0F2F4', padding: '1px 5px', borderRadius: '3px' }}>estate_admin</code>.
          </p>
          <p style={body}>
            Vercel Analytics and our own visit counts do <strong>not</strong> set cookies or store anything on your device. No consent banner is required
            for this tool under UK PECR, because no tracking cookies or equivalent technologies
            are used.
          </p>
        </Section>

        <Section title="6. Your rights under UK GDPR">
          <p style={body}>You have the right to:</p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}><strong>Access</strong> — ask for a copy of personal data we hold about you.</li>
            <li style={li}><strong>Erasure</strong> — delete any of your reports yourself from “My reports”, or delete your account and everything linked to it from the same page (you can also ask us to do it for you).</li>
            <li style={li}><strong>Rectification</strong> — ask us to correct inaccurate data.</li>
            <li style={li}><strong>Restriction</strong> — ask us to pause processing while a query is resolved.</li>
            <li style={li}><strong>Object</strong> — object to processing based on legitimate interests, including the use of anonymised information to improve the tool.</li>
            <li style={li}><strong>Portability</strong> — receive the data you gave us in a commonly used, machine-readable format.</li>
          </ul>
          <p style={body}>
            We will reply within one month. {BRAND.name} does not make decisions about you by automated
            means that have legal or similarly significant effects; reports are about projects, not people.
          </p>
          <p style={body}>
            To exercise any right, including closing your account, contact us from the email address your account uses.
          </p>
          <p style={{ ...body, background: '#F8F1E2', border: `1px solid ${BLUE}`, borderRadius: '4px', padding: '12px 14px' }}>
            <strong>Contact:</strong> email <a href={`mailto:${BRAND.email}`} style={{ color: NAVY, fontWeight: 600 }}>{BRAND.email}</a>.
          </p>
          <p style={body}>
            You also have the right to complain to the{' '}
            <a href="https://ico.org.uk/make-a-complaint" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>
              Information Commissioner&apos;s Office
            </a>{' '}
            if you believe your personal data has been mishandled.
          </p>
        </Section>

        <Section title="7. Security and age">
          <p style={body}>
            Passwords are stored only as one-way hashes, connections are encrypted, and reports can be opened
            only by their owner and the administrator. No online service can be guaranteed completely secure;
            if a breach put your data at risk we would tell you and, where required, the ICO.
          </p>
          <p style={body}>
            {BRAND.name} is not intended for anyone under 18, and we do not knowingly collect their data.
          </p>
        </Section>

        <Section title="8. Changes to this notice">
          <p style={body}>
            This notice will be updated when data practices change. The current version is always
            at <code>/privacy</code>. The &ldquo;last reviewed&rdquo; date at the top of the page
            will be updated with each revision.
          </p>
        </Section>

      </main>

      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ color: '#6B7280', fontSize: '12px', margin: 0 }}>
          {BRAND.name} &nbsp;·&nbsp;
          <a href={DATA_PAGE.href} style={{ color: BLUE }}>{DATA_PAGE.label}</a>
          &nbsp;·&nbsp;
          <a href="/terms" style={{ color: BLUE }}>Terms of Use</a>
          &nbsp;·&nbsp;
          <a href="/reports" style={{ color: BLUE }}>Return to tool</a>
          &nbsp;·&nbsp; Last reviewed 28 October 2026
        </p>
      </footer>

    </div>
  )
}
