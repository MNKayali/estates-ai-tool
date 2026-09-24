import { cleanReportText, vatPct } from '@/lib/reportContent'
import { BodyPage, Band, Pending } from './parts'

const BUDGET = { sufficient: ['r-callout-ok', 'sufficient'], tight: ['r-callout-warn', 'tight'], insufficient: ['r-callout-bad', 'shortfall'] }

export default function SummaryPage({ data, ctx, n }) {
  const { cost, programme, aiProse, budget } = data
  const m = ctx.money
  const b = budget && budget.status !== 'none' && budget.note ? BUDGET[budget.status] : null
  return (
    <BodyPage ctx={ctx} page={n}>
      <div className="r-strip">
        <div><div className="r-lbl">Total project cost</div><div className="v">{m(cost?.total?.low)} – {m(cost?.total?.high)}</div><div className="s">Excl. VAT · {m(cost?.vat)} VAT at {vatPct(cost)}% (mid-point, for reference)</div></div>
        <div><div className="r-lbl">Programme</div><div className="v">{programme?.totalWeeks} weeks</div><div className="s">{programme?.floatWeeks > 0 ? `Incl. ${programme.floatWeeks} weeks float · best case ${programme.totalWeeksBestCase} weeks` : 'Critical path, no float'}</div></div>
        <div><div className="r-lbl">BCIS region</div><div className="v">{cost?.bcisRegion || '—'}</div><div className="s">Location factor {cost?.bcisFactor}</div></div>
      </div>
      <Band no={1} title="Executive Summary" />
      {aiProse?.executiveSummary ? <p>{cleanReportText(aiProse.executiveSummary)}</p> : ctx.isPending && <Pending />}
      {aiProse?.keyFindings?.length > 0 && <>
        <h3>Key findings</h3>
        <ul>{aiProse.keyFindings.map((k, i) => <li key={i}>{cleanReportText(k)}</li>)}</ul>
      </>}
      {b && <div className={`r-callout ${b[0]}`}><b>Budget check: {b[1]}.</b> {budget.note}</div>}
      {programme?.targetStatus === 'at-risk' && programme.targetNote && <div className="r-callout r-callout-warn"><b>Target date:</b> {programme.targetNote}</div>}
    </BodyPage>
  )
}
