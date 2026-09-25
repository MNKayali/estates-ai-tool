import { BRAND } from '@/lib/reportStyle'
import { LOGOS, logoWidth } from '@/lib/brand'
import { coverTitle, coverTitleSize, coverSubtitle, coverCostRange, confidenceWord, deriveCostRiskLevel, coverFactRows } from '@/lib/reportContent'
import { Sheet } from './parts'

export default function CoverPage({ data, ctx }) {
  const { answers, cost, programme, confidence, aiProse } = data
  const title = coverTitle(answers)
  const grade = confidence?.score || aiProse?.confidenceScore || 'B'
  const label = confidence?.label || aiProse?.confidenceLabel || 'Moderate Confidence'
  return (
    <Sheet className="r-cover">
      <div className="r-cv-top">
        <div className="r-cv-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo printed by Puppeteer; next/image adds nothing */}
          <img src={LOGOS.wordmarkWhite.src} alt={BRAND.name} width={logoWidth(LOGOS.wordmarkWhite, 35)} height={35} />
          <small>{BRAND.tagline}</small>
        </div>
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
          {coverFactRows(answers, cost).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody></table>
        <table className="r-facts"><tbody>
          <tr><td>Report date</td><td>{ctx.dateLong}</td></tr>
          <tr><td>Reference</td><td className="r-mono">{ctx.reference}</td></tr>
          <tr><td>Status</td><td>Indicative</td></tr>
        </tbody></table>
      </div>
      <p className="r-cv-note">Order of cost estimate from benchmark rates, not measured quantities. Not for financial commitment without review by a Chartered Quantity Surveyor.</p>
      <div className="r-cv-foot"><span>{BRAND.name.toUpperCase()} &nbsp;|&nbsp; FEASIBILITY REPORT</span><em>Ref {ctx.reference} · {ctx.dateLong}</em></div>
    </Sheet>
  )
}
