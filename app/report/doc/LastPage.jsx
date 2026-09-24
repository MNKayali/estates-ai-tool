// Always the last page: next steps, disclaimer and the contact block.
import { BRAND } from '@/lib/reportStyle'
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
        <div className="r-c-brand"><span className="r-mark">{BRAND.mark}</span><div><b>{BRAND.name}</b><small>{BRAND.strapline}</small></div></div>
        <div className="r-c-body">
          <h3>Further information</h3>
          <p>For questions about this report, or to take the project on to a full cost plan and Stage 2 brief, contact our team and quote reference <b className="r-mono">{ctx.reference}</b>.</p>
          <table className="r-kv r-c-kv"><tbody>
            <tr><td>Email</td><td>{BRAND.email}</td></tr>
            <tr><td>Telephone</td><td>{BRAND.phone}</td></tr>
            <tr><td>Web</td><td>{BRAND.web}</td></tr>
          </tbody></table>
        </div>
      </div>
    </BodyPage>
  )
}
