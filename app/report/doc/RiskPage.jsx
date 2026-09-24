import { TABLES, LIMITS } from '@/lib/reportStyle'
import { prepareRisks, riskTableMode, RAG_CLASS } from '@/lib/reportContent'
import { BodyPage, Band, Cols, Pending } from './parts'

export default function RiskPage({ data, ctx, n }) {
  const { risks, counts } = prepareRisks(data.aiProse?.riskRegister)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={3} title="Risk Register" note={`Ordered by rating · ${LIMITS.maxRisks} risks at most`} />
      {risks.length === 0
        ? (ctx.isPending ? <Pending /> : <p className="r-lead">No risk register data available.</p>)
        : <>
          <div className="r-rag-sum" aria-label="Risk summary">
            {['High', 'Medium', 'Low'].map(k => <span key={k}><b className={`r-bg-${RAG_CLASS[k]}`}>{counts[k]}</b>{k}</span>)}
          </div>
          <table className={`r-t r-risk ${riskTableMode(risks)}`}>
            <Cols widths={TABLES.risk} />
            <thead><tr><th>Ref</th><th>Category</th><th>Description</th><th>Rating</th><th>Mitigation</th></tr></thead>
            <tbody>
              {risks.map(r => (
                <tr key={r.ref} className={RAG_CLASS[r.rating] || ''}>
                  <td className="r-ref">{r.ref}</td>
                  <td>{r.category}</td>
                  <td>{r.description}</td>
                  <td><span className={`r-pill ${RAG_CLASS[r.rating] || 'med'}`}>{r.rating}</span></td>
                  <td>{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
    </BodyPage>
  )
}
