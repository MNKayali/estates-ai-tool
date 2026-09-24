import { TABLES } from '@/lib/reportStyle'
import { fmtDate, programmeHeadline } from '@/lib/reportShared'
import {
  selectMilestones, overviewSegments, programmeDetailRows, programmeNarrativeLines, targetPct,
  milestoneTickClass, fmtMonthYear, fmtShortDate, SEGMENT_KEY_LABELS,
} from '@/lib/reportContent'
import { BodyPage, Band, Cols } from './parts'

const short = fmtShortDate

export default function ProgrammePage({ data, ctx, n }) {
  const p = data.programme || {}
  const ms = selectMilestones(p)
  const segs = overviewSegments(p)
  const rows = programmeDetailRows(p)
  const target = targetPct(p, data.answers)
  const total = p.totalWeeks || 0
  const cats = [...new Set(segs.map(s => s.category))]
  const surveys = rows.find(r => r.stage === 'Surveys')
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={4} title="High-Level Programme" note={programmeHeadline(p)} />
      <h3 className="r-first">Key milestones</h3>
      <div className="r-ms-list" style={{ '--rows': Math.ceil(ms.length / 2) }}>
        {ms.map(m => (
          <div key={m.id}><b>{m.id}</b><span>{m.label}</span><span className={m.missedTarget ? 'r-late' : ''}>{fmtDate(m.date)} · wk {m.week}</span></div>
        ))}
      </div>

      <div className="r-pbar" role="img" aria-label={`Programme overview: ${segs.map(s => `${s.label} ${s.weeks} weeks`).join(', ')}`}>
        {target != null && <div className="r-target" style={{ left: `${target}%` }}><span>Target {fmtDate(data.answers?.q4_1_targetDate)}</span></div>}
        <div className="r-segs">
          {segs.map((s, i) => (
            <div key={i} className={`r-seg-${s.category}`} style={{ width: `${s.pct}%` }}>
              {s.narrow ? `${s.weeks}w` : <>{s.label}<span>{s.weeks} wks</span></>}
            </div>
          ))}
        </div>
      </div>
      <div className="r-ticks">
        {ms.map((m, i) => (
          <div key={m.id} className={milestoneTickClass(ms, i, total)} style={{ left: `${total ? (m.week / total) * 100 : 0}%` }}>
            <b>{m.id}</b> <span>{fmtMonthYear(m.date)}</span>
          </div>
        ))}
      </div>
      <div className="r-pkey">
        {cats.map(c => <span key={c}><i className={`r-seg-${c}`} />{SEGMENT_KEY_LABELS[c]}</span>)}
        {surveys && <span>Surveys {surveys.weeks} wks alongside design</span>}
        {target != null && <span className="r-late">┆ Client target</span>}
      </div>

      <h3>Programme detail</h3>
      <table className="r-t r-prog">
        <Cols widths={TABLES.programme} />
        <thead><tr><th>Stage</th><th>Activity</th><th>Start</th><th>End</th><th className="r-num">Wks</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.stage}{r.parallel ? ' ∥' : ''}</td>
              <td>{r.activity}</td>
              <td>{short(r.start)}</td>
              <td>{short(r.end)}</td>
              <td className={`r-num ${r.parallel ? 'r-par' : ''}`}>{r.parallel ? `(${r.weeks})` : r.weeks}</td>
            </tr>
          ))}
          <tr className="r-tot"><td>Total</td><td></td><td>{short(p.startDate)}</td><td>{short(p.endDate)}</td><td className="r-num">{total}</td></tr>
        </tbody>
      </table>

      <h3>Programme narrative and assumptions</h3>
      <ul className="r-tight">{programmeNarrativeLines(p).map((l, i) => <li key={i}>{l}</li>)}</ul>
    </BodyPage>
  )
}
