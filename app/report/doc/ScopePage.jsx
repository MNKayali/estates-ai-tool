import { cleanReportText, scopeStatement, scopeGroups, notInScopeLines, notPricedLines } from '@/lib/reportContent'
import { BodyPage, Band, Pending } from './parts'

export default function ScopePage({ data, ctx, n }) {
  const { cost, aiProse } = data
  const notPriced = notPricedLines(cost)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={2} title="Scope of Works" />
      <p>{scopeStatement(cost, data.answers)}</p>
      <h3>Included works</h3>
      <div className="r-scope-grid">
        {scopeGroups(cost).map(g => (
          <div key={g.label} className={g.items.length > 4 ? 'wide' : ''}>
            <h4>{g.label}</h4>
            <ul>{g.items.map(it => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="r-two">
        <div>
          <h3>Scope assumptions</h3>
          {aiProse?.scopeAssumptions?.length
            ? <ul>{aiProse.scopeAssumptions.map((a, i) => <li key={i}>{cleanReportText(a)}</li>)}</ul>
            : ctx.isPending ? <Pending /> : <p className="r-lead">Scope to be confirmed after surveys and Stage 2 design.</p>}
        </div>
        <div>
          <h3>Not in scope</h3>
          <ul>{notInScopeLines(cost).map(l => <li key={l}>{l}</li>)}</ul>
        </div>
      </div>
      {notPriced.length > 0 && <>
        <h3>Selected but not priced</h3>
        <ul className="r-tight">{notPriced.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </>}
    </BodyPage>
  )
}
