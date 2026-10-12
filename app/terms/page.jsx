/**
 * /terms — Terms of Use
 * Operator: Projento
 * Last reviewed: 12 October 2026
 * Governing law: England and Wales
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

export default function TermsPage() {
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
          Terms of Use
        </h1>
        <p style={{ ...body, color: '#666', marginBottom: '32px' }}>
          Last reviewed: 12 October 2026 &nbsp;|&nbsp; Governing law: England and Wales
        </p>

        <Section title="1. About this tool">
          <p style={body}>
            {BRAND.name} is a planning tool that generates indicative feasibility reports at{' '}
            <strong>RIBA Stage 0–1</strong> accuracy, for early-stage estates planning and capital
            investment appraisal.
          </p>
          <p style={body}>
            You can try it free without an account (three reports, viewed on screen), or create a free
            account for unlimited reports and PDF and Word downloads. By using this tool, or by creating
            an account or signing in, you agree to these terms, which include our{' '}
            <a href={DATA_PAGE.href} style={{ color: BLUE }}>{DATA_PAGE.label}</a> page.
          </p>
          <p style={body}>
            {BRAND.name} is a free, non-commercial research and development project, run from England.
            &ldquo;We&rdquo; and &ldquo;us&rdquo; in these terms mean the operator of {BRAND.name}, who can be
            contacted at <a href={`mailto:${BRAND.email}`} style={{ color: BLUE }}>{BRAND.email}</a>.
            Features, rates, methods and outputs may change or be withdrawn without notice.
          </p>
          <p style={body}>
            {BRAND.name} is intended for people aged 18 or over who use it for their work, business or
            organisation. If you use it on behalf of an organisation, you confirm you are allowed to do so.
          </p>
        </Section>

        <Section title="2. What this tool produces — and what it does not">
          <p style={body}>
            Cost figures are order-of-cost estimates in the RICS NRM1 sense, prepared at RIBA Stage 0–1 from
            benchmark rates. Each report prints its own estimate range, set by its confidence grade; the
            outturn cost can move outside that range as surveys, design and procurement progress. Programme
            durations, risks, procurement suggestions and all other content are indicative only. Every report
            carries an Important Notice to the same effect. Outputs <strong>do not constitute</strong>:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}>a formal cost plan prepared by a Chartered Quantity Surveyor;</li>
            <li style={li}>professional architectural, engineering, or project management advice;</li>
            <li style={li}>a valuation, appraisal, or investment recommendation;</li>
            <li style={li}>legal, planning, or regulatory advice of any kind;</li>
            <li style={li}>health and safety, CDM, asbestos or fire risk assessment;</li>
            <li style={li}>financial, investment or procurement advice.</li>
          </ul>
          <p style={body}>
            Reports are intended to inform internal discussion and early-stage decision-making only.
            Before committing to any expenditure, procurement action, or design brief, outputs must be
            reviewed and verified by an appropriately qualified professional — typically a Chartered
            Quantity Surveyor for cost matters and a qualified architect or project manager for programme.
          </p>
        </Section>

        <Section title="3. Sharing reports with others">
          <p style={body}>
            {BRAND.name} is not a regulated professional service and we do not hold professional indemnity
            insurance for its outputs. A report is comparable to a benchmark spreadsheet or early desk
            study — useful for framing a conversation, not for signing off a budget.
          </p>
          <p style={{ ...body, background: '#F8F1E2', border: `1px solid ${BLUE}`, borderRadius: '4px', padding: '12px 14px' }}>
            <strong>What this means in practice:</strong> if you show or pass a report to anyone else (a
            client, funder, board or colleague), share it in full, including its Important Notice, and make
            sure they understand it is indicative. If a report is to be presented as a professional output,
            it should first be reviewed and adopted by a suitably qualified professional who carries their
            own professional indemnity cover. Anyone you share a report with has no rights against us under
            these terms.
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <p style={body}>You agree to use this tool only for early-stage, pre-design planning and to:</p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}>keep your password confidential, not share your account, and tell us straight away if you think someone else has used it;</li>
            <li style={li}>treat all outputs as indicative and subject to professional review;</li>
            <li style={li}>not enter personal data about individuals into the questionnaire fields
              (the tool is designed for project-level data — building type, size, location — not personal records);</li>
            <li style={li}>not use the tool to generate reports intended to deceive or mislead any party about
              project costs or feasibility;</li>
            <li style={li}>not try to break, overload, scrape or get around the tool&apos;s limits or security,
              including by creating accounts or clearing cookies to get more free reports.</li>
          </ul>
          <p style={body}>
            We may suspend or close an account, or refuse access, if these terms are broken, and we may
            change, pause or withdraw the tool at any time.
          </p>
        </Section>

        <Section title="5. Limitation of liability">
          <p style={body}>
            {BRAND.name} is provided free of charge and &ldquo;as is&rdquo;, without any promise that it is
            accurate, complete, suitable for a particular purpose or always available. To the fullest extent
            permitted by law, we exclude all liability, whether in contract, tort (including negligence) or
            otherwise, for:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}>any loss, damage, cost or expense arising from any use of, or reliance on, cost
              estimates, programme durations, risks, procurement suggestions or any other output, whether by
              you or by any third party to whom a report is shown or passed;</li>
            <li style={li}>errors or omissions in the information you provide, on which every report is based;</li>
            <li style={li}>errors, omissions or inaccuracies in the benchmark rates, durations, factors and
              other reference data the tool uses;</li>
            <li style={li}>any loss of profit, revenue, business, contract, opportunity or anticipated savings,
              and any indirect or consequential loss;</li>
            <li style={li}>temporary unavailability due to maintenance, Vercel infrastructure outages,
              or third-party service downtime;</li>
            <li style={li}>loss of report data, including reports you delete and reports removed under the
              retention periods in our Privacy Notice.</li>
          </ul>
          <p style={body}>
            If, despite the above, we are found liable to you, our total liability for all claims arising
            from or in connection with {BRAND.name} and its reports is limited to £20.
          </p>
          <p style={body}>
            Nothing in these terms excludes or limits liability for death or personal injury caused by
            negligence, for fraud or fraudulent misrepresentation, or for anything else that cannot be
            excluded or limited by law. If you use {BRAND.name} as a consumer, nothing in these terms
            affects your statutory rights.
          </p>
        </Section>

        <Section title="6. Intellectual property">
          <p style={body}>
            Reports generated by this tool belong to the organisation or individual who generated them.
            The underlying software, cost model and report templates remain proprietary. You may not attempt
            to reverse-engineer the tool, resell access, or redistribute generated reports as a commercial
            product without prior written consent.
          </p>
        </Section>

        <Section title="7. Data and privacy">
          <p style={body}>
            The project data you enter is used only within {BRAND.name}, as described in our{' '}
            <a href={DATA_PAGE.href} style={{ color: BLUE }}>{DATA_PAGE.label}</a> page and{' '}
            <a href="/privacy" style={{ color: BLUE }}>Privacy Notice</a>.
            By using this tool you confirm that the project information you provide does not include
            personal data about identifiable individuals beyond what is strictly necessary, and that
            you have authority to submit that information.
          </p>
        </Section>

        <Section title="8. Changes to these terms">
          <p style={body}>
            These terms may be updated from time to time. The current version is always available at{' '}
            <code>/terms</code>, with its date at the top. We will email account holders about a significant
            change before it takes effect. Using the tool after a change takes effect means you accept it;
            if you do not, you can stop using it and ask us to close your account.
          </p>
        </Section>

        <Section title="9. General">
          <p style={body}>
            These terms, with the pages they refer to, are the whole agreement between you and us about{' '}
            {BRAND.name}. No one other than you and us has any right to enforce them under the Contracts
            (Rights of Third Parties) Act 1999. If any part of them is found unenforceable, the rest still
            applies.
          </p>
        </Section>

        <Section title="10. Governing law">
          <p style={body}>
            These terms are governed by the laws of England and Wales. Any dispute shall be subject
            to the exclusive jurisdiction of the courts of England and Wales, unless you are a consumer
            living elsewhere in the UK, in which case you may also bring proceedings in your local courts.
          </p>
        </Section>

      </main>

      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ color: '#6B7280', fontSize: '12px', margin: 0 }}>
          {BRAND.name} &nbsp;·&nbsp;
          <a href={DATA_PAGE.href} style={{ color: BLUE }}>{DATA_PAGE.label}</a>
          &nbsp;·&nbsp;
          <a href="/privacy" style={{ color: BLUE }}>Privacy Notice</a>
          &nbsp;·&nbsp;
          <a href="/reports" style={{ color: BLUE }}>Return to tool</a>
          &nbsp;·&nbsp; Last reviewed 12 October 2026
        </p>
      </footer>

    </div>
  )
}
