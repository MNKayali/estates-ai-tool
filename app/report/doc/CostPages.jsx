import { TABLES } from '@/lib/reportStyle'
import { UNVERIFIED_MARK } from '@/lib/reportShared'
import {
  cleanReportText, costIntroText, worksRows, worksTableMode, worksGroupRows, lineQty, lineBasisWord,
  projectCostRows, percentageLines, costAssumptionLines, costExclusionLines,
} from '@/lib/reportContent'
import { BodyPage, Band, Cols } from './parts'

function LinesTable({ rows, total, m }) {
  return (
    <table className="r-t">
      <Cols widths={TABLES.works} />
      <thead><tr><th>Code</th><th>Element</th><th className="r-num">Qty</th><th>Basis</th><th className="r-num">Low £</th><th className="r-num">High £</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (r.type === 'group'
          ? <tr key={i} className="r-g"><td colSpan={6}>{r.label}</td></tr>
          : (
            <tr key={i}>
              <td className="r-code">{r.item.code}</td>
              <td>{r.item.description}{r.item.aiEstimate ? ` ${UNVERIFIED_MARK}` : ''}</td>
              <td className="r-num">{lineQty(r.item)}</td>
              <td className="r-rate">{lineBasisWord(r.item)}</td>
              <td className="r-num">{m(r.low ?? r.item.lineLow, true)}</td>
              <td className="r-num">{m(r.high ?? r.item.lineHigh, true)}</td>
            </tr>
          )))}
        {total && <tr className="r-tot"><td></td><td>Works cost total</td><td></td><td></td><td className="r-num">{m(total.low, true)}</td><td className="r-num">{m(total.high, true)}</td></tr>}
      </tbody>
    </table>
  )
}

export function CostWorksPage({ data, ctx, n }) {
  const { cost, aiProse } = data
  const m = ctx.money
  const mode = worksTableMode(cost)
  const unverified = (cost?.lineItems || []).some(l => l.aiEstimate)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={5} title="Order of Cost Estimate" note="1 of 2 · Works cost" />
      <p className="r-lead">{aiProse?.costNarrative ? cleanReportText(aiProse.costNarrative) : costIntroText(cost, data.answers)}</p>
      {mode === 'lines'
        ? <LinesTable rows={worksRows(cost)} total={cost?.works} m={m} />
        : (
          <table className="r-t">
            <Cols widths={TABLES.worksGroups} />
            <thead><tr><th>Element group</th><th className="r-num">Items</th><th className="r-num">Low £</th><th className="r-num">High £</th></tr></thead>
            <tbody>
              {worksGroupRows(cost).map(g => <tr key={g.label}><td>{g.label}</td><td className="r-num">{g.count}</td><td className="r-num">{m(g.low, true)}</td><td className="r-num">{m(g.high, true)}</td></tr>)}
              <tr className="r-tot"><td>Works cost total</td><td></td><td className="r-num">{m(cost?.works?.low, true)}</td><td className="r-num">{m(cost?.works?.high, true)}</td></tr>
            </tbody>
          </table>
        )}
      <p className="r-foot-note">
        {mode === 'groups' ? 'Full line-by-line breakdown in Appendix A. ' : ''}
        {unverified ? `${UNVERIFIED_MARK} Rate marked for verification in the rates workbook. ` : ''}
        Low and high reflect the estimate range; see the next page.
      </p>
    </BodyPage>
  )
}

const ROW_CLASS = { row: '', subtotal: 'r-sub', total: 'r-tot', ref: 'r-refrow' }

export function CostSummaryPage({ data, ctx, n }) {
  const { cost, answers } = data
  const m = ctx.money
  const pl = percentageLines(cost)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={5} title="Order of Cost Estimate" note="2 of 2 · Project cost" />
      <table className="r-t">
        <Cols widths={TABLES.projectCost} />
        <thead><tr><th>Item</th><th>Rate</th><th className="r-num">Low £</th><th className="r-num">High £</th></tr></thead>
        <tbody>
          {projectCostRows(cost).map((r, i) => (
            <tr key={i} className={ROW_CLASS[r.kind]}>
              <td>{r.label}</td><td className="r-rate">{r.rate}</td><td className="r-num">{m(r.low, true)}</td><td className="r-num">{m(r.high, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pl.length > 0 && <>
        <h3>How the percentages were set</h3>
        <ul className="r-tight">{pl.map(l => <li key={l.name}><b>{l.name} {l.pct}:</b> {l.text}.</li>)}</ul>
      </>}
      <div className="r-two">
        <div><h3>Cost assumptions</h3><ul className="r-tight">{costAssumptionLines(cost, answers).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        <div><h3>Cost exclusions</h3><ul className="r-tight">{costExclusionLines(cost, answers).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
      </div>
    </BodyPage>
  )
}

export function AppendixPage({ data, ctx, n, page }) {
  const last = page.part === page.parts
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no="A" title="Appendix A · Works cost, line by line" note={`Part ${page.part} of ${page.parts}`} />
      <LinesTable rows={page.rows} total={last ? data.cost?.works : null} m={ctx.money} />
    </BodyPage>
  )
}
