/**
 * /terms — Terms of Use
 *
 * ⚠️ LEGAL REVIEW REQUIRED
 * This page was drafted to accurately reflect the architecture and intended use
 * of Estates AI Tool. It must be reviewed and approved by a qualified solicitor
 * before you present the tool to any external party or rely on these terms
 * in a dispute. Your organisation's legal team should also confirm the
 * professional-indemnity (PI) position with your PI broker.
 *
 * Placeholders to fill in before publishing:
 *   [YOUR ORGANISATION NAME]
 *   [YOUR ORGANISATION ADDRESS]
 *   [LEGAL@YOURORGANISATION.COM]
 *   Last reviewed date
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

export default function TermsPage() {
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
            <strong>⚠️ Draft — solicitor review required.</strong> These terms have not yet been reviewed by a qualified solicitor.
            The operator of this tool must obtain legal sign-off before relying on these terms or making the tool available beyond an internal pilot group.
          </p>
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>
          Terms of Use
        </h1>
        <p style={{ ...body, color: '#666', marginBottom: '32px' }}>
          Last reviewed: [DATE] &nbsp;|&nbsp; Governing law: England and Wales
        </p>

        <Section title="1. Who we are">
          <p style={body}>
            This tool is operated by <strong>[YOUR ORGANISATION NAME]</strong>, registered at <strong>[YOUR ORGANISATION ADDRESS]</strong>
            (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). References to &ldquo;you&rdquo; mean any authorised user accessing this tool.
          </p>
        </Section>

        <Section title="2. What this tool is (and is not)">
          <p style={body}>
            Estates AI Tool generates indicative feasibility reports at <strong>RIBA Stage 0–1</strong> accuracy using benchmark cost data
            from BCIS / RICS and AI-assisted narrative generation. It is intended as an <strong>internal planning aid only</strong>.
          </p>
          <p style={body}>
            All cost figures carry an inherent accuracy of <strong>±15–25%</strong> as defined by RICS NRM1 for order-of-cost estimates.
            Programme durations are indicative and assume standard conditions. Outputs of this tool <strong>do not constitute</strong>:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}>a formal cost plan prepared by a Chartered Quantity Surveyor;</li>
            <li style={li}>professional architectural, engineering, or project management advice;</li>
            <li style={li}>a valuation, appraisal, or investment recommendation;</li>
            <li style={li}>legal, planning, or regulatory advice of any kind.</li>
          </ul>
          <p style={body}>
            Before committing to any expenditure, procurement, or design decision based on this tool&apos;s outputs, you must obtain
            independent professional advice from appropriately qualified and insured practitioners.
          </p>
        </Section>

        <Section title="3. Professional indemnity">
          <p style={body}>
            <strong>[YOUR ORGANISATION NAME]</strong> is not a regulated professional services firm for the purposes of these reports.
            This tool does not carry professional-indemnity (PI) insurance in respect of its outputs.
            Any reliance on these outputs is at your own risk and that of your organisation.
          </p>
          <p style={{ ...body, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '12px 14px' }}>
            ⚠️ <strong>PI position — action required:</strong> Before this tool is used by anyone who may rely on its figures for budgeting
            or procurement decisions, the operator should confirm with their PI broker whether existing coverage extends to AI-assisted
            feasibility outputs, or whether a separate endorsement is needed.
          </p>
        </Section>

        <Section title="4. Authorised use">
          <p style={body}>Access to this tool is restricted to authorised personnel only. You agree that you will:</p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}>use the tool solely for internal pre-design planning purposes;</li>
            <li style={li}>not share your access code with anyone outside your authorised team;</li>
            <li style={li}>not use the tool to generate reports for clients or third parties unless your organisation has appropriate PI cover in place;</li>
            <li style={li}>treat all outputs as indicative and subject to professional review before any decision is made;</li>
            <li style={li}>not enter special-category personal data or commercially sensitive third-party information into the questionnaire fields.</li>
          </ul>
        </Section>

        <Section title="5. Limitation of liability">
          <p style={body}>
            To the fullest extent permitted by law, <strong>[YOUR ORGANISATION NAME]</strong> excludes all liability for:
          </p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 10px' }}>
            <li style={li}>any loss or damage arising from reliance on cost estimates, programme durations, or other outputs of this tool;</li>
            <li style={li}>errors, omissions, or inaccuracies in the underlying benchmark data;</li>
            <li style={li}>temporary unavailability of the tool due to maintenance, third-party service outages, or technical failure;</li>
            <li style={li}>any indirect, consequential, or economic loss.</li>
          </ul>
          <p style={body}>
            Nothing in these terms excludes liability for death or personal injury caused by negligence,
            or for fraudulent misrepresentation.
          </p>
        </Section>

        <Section title="6. Intellectual property">
          <p style={body}>
            Reports generated by this tool are the property of your organisation. The underlying software,
            benchmark data, and AI models remain the property of their respective owners.
            You may not reverse-engineer, resell, or redistribute the tool or its outputs without our prior written consent.
          </p>
        </Section>

        <Section title="7. Data and privacy">
          <p style={body}>
            The project data you enter is processed as described in our{' '}
            <a href="/privacy" style={{ color: BLUE }}>Privacy Notice</a>.
            By using this tool you confirm you have authority to submit the project information provided
            and that it does not contain personal data about individuals beyond what is strictly necessary.
          </p>
        </Section>

        <Section title="8. Changes to these terms">
          <p style={body}>
            We may update these terms at any time. The current version will always be available at <code>/terms</code>.
            Continued use of the tool after a revision constitutes acceptance of the updated terms.
          </p>
        </Section>

        <Section title="9. Governing law">
          <p style={body}>
            These terms are governed by the laws of England and Wales.
            Any dispute arising from use of this tool shall be subject to the exclusive jurisdiction
            of the courts of England and Wales.
          </p>
        </Section>

        <Section title="10. Contact">
          <p style={body}>
            Questions about these terms: <a href="mailto:[LEGAL@YOURORGANISATION.COM]" style={{ color: BLUE }}>[LEGAL@YOURORGANISATION.COM]</a>
          </p>
        </Section>

      </main>

      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>
          Estates AI Tool &nbsp;·&nbsp;
          <a href="/privacy" style={{ color: '#2E75B6' }}>Privacy Notice</a>
          &nbsp;·&nbsp;
          <a href="/access" style={{ color: '#2E75B6' }}>Return to tool</a>
        </p>
      </footer>

    </div>
  )
}
