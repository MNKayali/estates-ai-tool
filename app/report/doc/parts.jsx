// Shared building blocks for the report's A4 pages. Look comes from
// report.css (all var()s from lib/reportStyle.js), content from
// lib/reportContent.js — nothing here decides a colour, size or wording.
import { BRAND } from '@/lib/reportStyle'

export function Sheet({ className = '', children }) {
  return <div className="r-sheet"><div className={`r-page ${className}`}>{children}</div></div>
}

export function RunningHeader({ ctx }) {
  return (
    <div className="r-rh">
      <div className="r-rh-brand"><i>{BRAND.mark}</i>{BRAND.name} <span>· {ctx.short}</span></div>
      <div className="r-rh-doc">Feasibility Report · Ref {ctx.reference}</div>
    </div>
  )
}

export function RunningFooter({ page, ctx }) {
  return (
    <div className="r-rf">
      <span><b>{BRAND.name}</b> · {BRAND.strapline} · {BRAND.web} · Indicative only</span>
      <span>Page {page} of {ctx.totalPages}</span>
    </div>
  )
}

export function BodyPage({ ctx, page, className = '', children }) {
  return (
    <Sheet>
      <RunningHeader ctx={ctx} />
      <div className={`r-body ${className}`}>{children}</div>
      <RunningFooter page={page} ctx={ctx} />
    </Sheet>
  )
}

export function Band({ no, title, note }) {
  return (
    <div className="r-band">
      <span className="r-band-no">{typeof no === 'number' ? String(no).padStart(2, '0') : no}</span>
      <h2>{title}</h2>
      {note && <small>{note}</small>}
    </div>
  )
}

export function Cols({ widths }) {
  return <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w * 100}%` }} />)}</colgroup>
}

export function Pending() {
  return <p className="r-pending" role="status">This section is being written and appears in a few seconds.</p>
}
