// Financial Case, Procurement and Constraints: placed into shared pages by
// layoutLateSections() in lib/reportContent.js (the same decision Word uses).
import { TABLES } from '@/lib/reportStyle'
import { cleanReportText } from '@/lib/reportContent'
import { BodyPage, Band, Cols, Pending } from './parts'

function Roi({ data, ctx, no }) {
  const roi = ctx.roi
  const m = ctx.money
  const b = data.answers?.q5_1_financialBenefit
  const benefit = Array.isArray(b) ? b.join(', ') : (b || '—')
  return <>
    <Band no={no} title="Financial Case" />
    <div className="r-figs4">
      <div><div className="r-lbl">Project cost (mid)</div><div className="v">{m(roi?.mid)}</div></div>
      <div><div className="r-lbl">Annual benefit</div><div className="v">{m(roi?.annual)}</div></div>
      <div><div className="r-lbl">Simple payback</div><div className="v">{roi?.paybackYears} years</div></div>
      <div><div className="r-lbl">Benefit type</div><div className="v r-v-small">{benefit}</div></div>
    </div>
    {data.aiProse?.roiNarrative ? <p>{cleanReportText(data.aiProse.roiNarrative)}</p> : ctx.isPending && <Pending />}
  </>
}

function Procurement({ data, ctx, no }) {
  const a = data.aiProse || {}
  const p = data.programme || {}
  const design = String(a.procurementDesignResp || p.designResponsibility || '').toLowerCase()
  return <>
    <Band no={no} title="Procurement Recommendation" />
    <table className="r-kv"><tbody>
      <tr><td>Route</td><td>{a.procurementRoute || p.procurementRoute}</td></tr>
      <tr><td>Contract</td><td>{a.procurementContractForm || p.contractForm}</td></tr>
      <tr><td>Tender type · design</td><td>{a.procurementTenderType || p.tenderType}{design ? ` · ${design}` : ''}</td></tr>
    </tbody></table>
    {a.procurementNarrative ? <p>{cleanReportText(a.procurementNarrative)}</p> : ctx.isPending && <Pending />}
    {a.procurementConsiderations?.length > 0 && <>
      <h3>Commercial considerations</h3>
      <ul className="r-tight">{a.procurementConsiderations.map((c, i) => <li key={i}>{cleanReportText(c)}</li>)}</ul>
    </>}
    {a.procurementConflicts?.length > 0 && <ul className="r-tight r-conflicts">{a.procurementConflicts.map((c, i) => <li key={i}>{cleanReportText(c)}</li>)}</ul>}
  </>
}

function Constraints({ data, ctx, no }) {
  const list = data.aiProse?.constraints || []
  return <>
    <Band no={no} title="Constraints Summary" />
    {list.length === 0 ? (ctx.isPending ? <Pending /> : null) : (
      <table className="r-t">
        <Cols widths={TABLES.constraints} />
        <thead><tr><th>Category</th><th>Constraint</th><th>Impact</th></tr></thead>
        <tbody>{list.map((c, i) => <tr key={i}><td>{c.category}</td><td><b>{cleanReportText(c.title)}</b></td><td>{cleanReportText(c.text)}</td></tr>)}</tbody>
      </table>
    )}
  </>
}

const SECTIONS = { roi: Roi, procurement: Procurement, constraints: Constraints }

export default function LatePage({ data, ctx, n, page }) {
  return (
    <BodyPage ctx={ctx} page={n}>
      {page.slots.map(s => {
        const Section = SECTIONS[s.key]
        return <section key={s.key} className={`r-slot r-slot-${s.slot}`}><Section data={data} ctx={ctx} no={s.no} /></section>
      })}
    </BodyPage>
  )
}
