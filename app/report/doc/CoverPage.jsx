import { BRAND } from '@/lib/reportStyle'
import { coverTitle, coverTitleSize, coverSubtitle, coverCostRange, confidenceWord, deriveCostRiskLevel } from '@/lib/reportContent'
import { Sheet } from './parts'

export default function CoverPage({ data, ctx }) {
  const { answers, cost, programme, confidence, aiProse } = data
  const title = coverTitle(answers)
  const grade = confidence?.score || aiProse?.confidenceScore || 'B'
  const label = confidence?.label || aiProse?.confidenceLabel || 'Moderate Confidence'
  return (
    <Sheet className="r-cover">
      <div className="r-cv-top">
        <div className="r-cv-brand"><span className="r-mark">{BRAND.mark}</span><div><b>{BRAND.name}</b><small>{BRAND.tagline}</small></div></div>
        <div className="r-cv-eyebrow"><div className="l1">RIBA STAGE 0–1</div><div className="l2">FEASIBILITY REPORT</div></div>
        <h1 className={`r-cv-title ${coverTitleSize(title)}`}>{title}</h1>
        <div className="r-cv-rule" />
        <div className="r-cv-sub">{coverSubtitle(answers, cost)}</div>
      </div>
      <div className="r-cv-figs">
        <div><div className="r-lbl">Total project cost</div><div className="v">{coverCostRange(cost)}</div><div className="s">excl. VAT</div></div>
        <div><div className="r-lbl">Programme</div><div className="v">{programme?.totalWeeks ?? '—'} weeks</div><div className="s">{programme?.floatWeeks > 0 ? `incl. ${programme.floatWeeks} weeks float` : 'critical path'}</div></div>
        <div><div className="r-lbl">Confidence</div><div className="v">Grade {grade}</div><div className="s">{confidenceWord(label)} · cost risk {deriveCostRiskLevel(cost, aiProse).toLowerCase()}</div></div>
      </div>
      <div className="r-cv-facts">
        <table className="r-facts"><tbody>
          <tr><td>Project type</td><td>{cost?.projectType || answers?.q1_2_projectType}</td></tr>
          {cost?.interventionLevel && <tr><td>Intervention</td><td>{cost.interventionLevel}</td></tr>}
          <tr><td>Specification</td><td>{cost?.specLevel}</td></tr>
        </tbody></table>
        <table className="r-facts"><tbody>
          <tr><td>Report date</td><td>{ctx.dateLong}</td></tr>
          <tr><td>Reference</td><td className="r-mono">{ctx.reference}</td></tr>
          <tr><td>Status</td><td>Indicative</td></tr>
        </tbody></table>
      </div>
      <p className="r-cv-note">Order of cost estimate from benchmark rates, not measured quantities. Not for financial commitment without review by a Chartered Quantity Surveyor.</p>
      <div className="r-cv-foot"><span>{BRAND.name.toUpperCase()} &nbsp;|&nbsp; FEASIBILITY REPORT</span><em>{BRAND.slogan}</em></div>
    </Sheet>
  )
}
