// Always the last page: next steps, disclaimer and the contact block.
import { BRAND } from '@/lib/reportStyle'
import { LOGOS, logoWidth, contactRows, contactLead } from '@/lib/brand'
import { cleanReportText, DISCLAIMER, dataSourcesSentence } from '@/lib/reportContent'
import { BodyPage, Band, Pending } from './parts'

export default function LastPage({ data, ctx, n, page }) {
  const { aiProse, cost, programme } = data
  return (
    <BodyPage ctx={ctx} page={n} className="r-lastp">
      <Band no={page.no} title="Recommendations and Next Steps" />
      {aiProse?.nextSteps?.length
        ? <ol>{aiProse.nextSteps.map((s, i) => <li key={i}>{cleanReportText(s)}</li>)}</ol>
        : ctx.isPending ? <Pending /> : <p>Commission outstanding surveys and appoint a design team to proceed to RIBA Stage 2.</p>}
      <div className="r-disc">
        <b>Disclaimer</b>
        {DISCLAIMER} {dataSourcesSentence(cost, programme)}{' '}
        Use of this tool is subject to our <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Notice</a>.
      </div>
      <div className="r-contact">
        <div className="r-c-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo, see CoverPage */}
          <img src={LOGOS.lockup.src} alt={BRAND.name} width={logoWidth(LOGOS.lockup, 24)} height={24} />
          <small>{BRAND.descriptor}</small>
        </div>
        <div className="r-c-body">
          <h3>Further information</h3>
          <p>{contactLead()}<b className="r-mono">{ctx.reference}</b>.</p>
          {contactRows().length > 0 && (
            <table className="r-kv r-c-kv"><tbody>
              {contactRows().map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
            </tbody></table>
          )}
        </div>
      </div>
    </BodyPage>
  )
}
