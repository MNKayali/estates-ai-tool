'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ─── Colour tokens ─────────────────────────────────────────────────────────────
const NAVY  = '#1F3864'
const BLUE  = '#2E75B6'
const GREEN = '#375623'
const RED   = '#C00000'
const AMBER = '#F4B942'

// ─── NRM1 group → trade name mapping ──────────────────────────────────────────
const TRADE_NAMES = {
  '0': 'ENABLING & DEMOLITION',
  '1': 'STRUCTURAL & CIVIL',
  '2': 'FABRIC & ENVELOPE',
  '3': 'INTERNAL FIT-OUT & FINISHES',
  '4': 'INTERNAL FIT-OUT & FINISHES',
  '5': 'MECHANICAL & ELECTRICAL SERVICES',
  '7': 'REPAIRS & MAINTENANCE',
  '8': 'EXTERNAL WORKS',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function extractSection(md, keyword) {
  if (!md) return ''
  const lines = md.split('\n')
  let inside = false
  const out = []
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inside) break
      if (line.toLowerCase().includes(keyword.toLowerCase())) { inside = true; continue }
    }
    if (inside) out.push(line)
  }
  return out.join('\n').trim()
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Spinner() {
  return <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
}

function Pill({ level }) {
  const map = { High: [RED, '#fff'], Medium: [AMBER, '#1A1A1A'], Low: [GREEN, '#fff'] }
  const [bg, fg] = map[level] || ['#ccc', '#000']
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}>{level}</span>
  )
}

function DataBox({ label, value }) {
  return (
    <div className="rounded-xl p-4 text-center bg-white" style={{ border: '1px solid #E2E8F0' }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>{label}</div>
      <div className="text-sm font-bold leading-snug" style={{ color: NAVY }}>{value || '—'}</div>
    </div>
  )
}

function Card({ num, title, children }) {
  return (
    <div className="mb-8 rounded-2xl overflow-hidden section-card" style={{ backgroundColor: '#F5F7FA' }}>
      <div className="flex items-center gap-3 px-6 py-4">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: NAVY }}>{num}</span>
        <h2 className="text-lg font-bold" style={{ color: NAVY }}>{title}</h2>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </div>
  )
}

function White({ children, className = '' }) {
  return <div className={`bg-white rounded-xl p-5 ${className}`}>{children}</div>
}

// ─── ReactMarkdown component map ──────────────────────────────────────────────
const MD = {
  h1: ({ children }) => <h1 className="text-xl font-bold mb-3" style={{ color: NAVY }}>{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mt-5 mb-2" style={{ color: NAVY }}>{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-4 mb-1" style={{ color: NAVY }}>{children}</h3>,
  p:  ({ children }) => <p className="mb-3 text-sm leading-relaxed" style={{ color: '#1A1A1A', lineHeight: '1.7' }}>{children}</p>,
  ul: ({ children }) => <ul className="mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 space-y-1 list-decimal pl-5 text-sm" style={{ color: '#1A1A1A' }}>{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm" style={{ color: '#1A1A1A' }}>
      <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: BLUE }} />
      <span>{children}</span>
    </li>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4 rounded-lg" style={{ border: '1px solid #E2E8F0' }}>
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ backgroundColor: NAVY }}>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => {
    // Detect group header row: first cell has text "GRP" (possibly wrapped in <strong>)
    const getCellText = (node) => {
      if (!node) return ''
      if (typeof node === 'string') return node
      if (Array.isArray(node)) return node.map(getCellText).join('')
      if (node?.props?.children !== undefined) return getCellText(node.props.children)
      return ''
    }
    const cells = Array.isArray(children) ? children : [children]
    const firstChild = cells.find(c => c?.props && !c?.props?.scope) // skip thead th
    const firstText = getCellText(firstChild?.props?.children).trim()
    if (firstText === 'GRP') {
      const secondChild = cells[cells.indexOf(firstChild) + 1]
      const groupName = getCellText(secondChild?.props?.children).trim()
      const isKey = groupName.includes('★')
      return (
        <tr>
          <td colSpan={10} className="px-3 py-2 text-xs font-bold text-white uppercase"
            style={{ backgroundColor: NAVY }}>
            {groupName.replace('★ KEY ELEMENT', '').replace('★', '').trim()}
            {isKey && <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-bold"
              style={{ backgroundColor: AMBER, color: '#1A1A1A' }}>★ KEY ELEMENT</span>}
          </td>
        </tr>
      )
    }
    return <tr className="border-b" style={{ borderColor: '#F0F4F8' }}>{children}</tr>
  },
  th:    ({ children }) => <th className="px-3 py-2.5 text-left text-xs font-semibold text-white whitespace-nowrap">{children}</th>,
  td:    ({ children }) => {
    const t = String(children || '')
    const c = t === 'High' ? RED : t === 'Medium' ? AMBER : t === 'Low' ? GREEN : null
    return <td className="px-3 py-2 text-xs" style={{ color: c || '#1A1A1A', fontWeight: c ? '700' : 'normal' }}>{children}</td>
  },
  strong:     ({ children }) => <strong className="font-bold" style={{ color: '#1A1A1A' }}>{children}</strong>,
  hr:         () => <hr className="my-4" style={{ borderColor: '#E2E8F0' }} />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 pl-4 my-3 italic text-sm" style={{ borderColor: BLUE, color: '#444' }}>{children}</blockquote>
  ),
}

function Md({ text }) {
  if (!text) return null
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{text}</ReactMarkdown>
}

// ─── Cover page ────────────────────────────────────────────────────────────────
function CoverPage({ projectName, generatedDate, score, meta }) {
  const conf = {
    A: { bg: GREEN, text: '#FFFFFF', label: 'High Confidence' },
    B: { bg: BLUE,  text: '#FFFFFF', label: 'Moderate Confidence' },
    C: { bg: AMBER, text: '#1A1A1A', label: 'Limited Confidence' },
    D: { bg: RED,   text: '#FFFFFF', label: 'High Uncertainty' },
  }[score] || { bg: AMBER, text: '#1A1A1A', label: 'Limited Confidence' }

  return (
    <div id="cover-page" className="px-10 py-14" style={{ backgroundColor: NAVY }}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#94B4CC' }}>
        RIBA Stage 0–1 Feasibility Report
      </p>
      <h1 className="text-4xl font-bold leading-tight mb-8" style={{ color: '#FFFFFF' }}>
        {projectName}
      </h1>
      <div className="grid grid-cols-3 gap-6 mt-6">
        {[
          { label: 'Generated',   value: generatedDate },
          { label: 'Standard',    value: 'RIBA Stage 0–1' },
          { label: 'Produced by', value: 'Estates AI Tool' },
        ].map(({ label, value }) => (
          <div key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.25)', paddingTop: '12px' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#94B4CC' }}>{label}</div>
            <div className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-8 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
          style={{ backgroundColor: conf.bg, color: conf.text }}>
          {score} — {conf.label}
        </span>
        {meta?.riskLevel && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold"
            style={{
              backgroundColor: meta.riskLevel === 'High' ? RED : meta.riskLevel === 'Medium' ? AMBER : GREEN,
              color: meta.riskLevel === 'Medium' ? '#1A1A1A' : '#FFFFFF',
            }}>
            {meta.riskLevel} Risk
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Section 1: Executive Summary ─────────────────────────────────────────────
function S1_Executive({ md, intel }) {
  const text = extractSection(md, 'executive summary')

  // Split on **Key Findings** marker that Layer 2 now generates
  const kfMarkerIdx = text.indexOf('**Key Findings**')
  const narrative = kfMarkerIdx >= 0 ? text.slice(0, kfMarkerIdx).trim() : text
  const kfBlock   = kfMarkerIdx >= 0 ? text.slice(kfMarkerIdx + 16).trim() : ''

  // Parse numbered items from the Key Findings block
  const parsedFindings = kfBlock
    .split('\n')
    .filter(l => /^\d+\./.test(l.trim()))
    .map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1').trim())
    .filter(Boolean)

  // Fallback to intel-derived key findings if markdown didn't include them
  const intelFindings = [
    intel?.confidenceScore && `Confidence: ${intel.confidenceScore} — ${intel.confidenceLabel || ''}`,
    intel?.programmeFlags && `Target date: ${intel.programmeFlags.targetDateAchievable ? 'Achievable' : 'NOT achievable with current scope and timeline'}`,
    intel?.percentageAdditions?.risk?.riskLevel && `Overall risk level: ${intel.percentageAdditions.risk.riskLevel}`,
    intel?.procurementRecommendation?.route && `Recommended procurement: ${intel.procurementRecommendation.route}${intel.procurementRecommendation.contractForm ? ' — ' + intel.procurementRecommendation.contractForm : ''}`,
  ].filter(Boolean)

  const findings = parsedFindings.length > 0 ? parsedFindings : intelFindings

  return (
    <Card num="1" title="Executive Summary">
      <White className="mb-4"><Md text={narrative || text} /></White>
      {findings.length > 0 && (
        <White>
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: NAVY }}>Key Findings</p>
          <ol className="space-y-2">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: NAVY }}>{i + 1}</span>
                <span className="text-sm pt-0.5" style={{ color: '#1A1A1A' }}>{f}</span>
              </li>
            ))}
          </ol>
        </White>
      )}
    </Card>
  )
}

// ─── Section 2: Scope of Works ────────────────────────────────────────────────
function S2_Scope({ intel, md }) {
  const included = intel?.nrm1Inclusions || []
  const excluded = intel?.nrm1Exclusions || []
  const text = extractSection(md, 'scope of works')

  // Parse assumption lines from markdown (lines starting with - after "Assumptions" heading)
  const assumptionLines = (() => {
    const lines = text.split('\n')
    let inAssumptions = false
    const out = []
    for (const l of lines) {
      if (/assumption/i.test(l)) { inAssumptions = true; continue }
      if (inAssumptions && /^[-*]\s/.test(l.trim())) out.push(l.replace(/^[-*]\s+/, '').trim())
      else if (inAssumptions && l.startsWith('#')) break
    }
    return out
  })()

  // When we have intel structured data, show two-column layout
  if (included.length > 0 || excluded.length > 0) {
    // Group by trade name (not just NRM1 group number)
    const byTrade = {}
    for (const item of included) {
      const tradeName = TRADE_NAMES[String(item.group)] || `Group ${item.group || '?'}`
      ;(byTrade[tradeName] = byTrade[tradeName] || []).push(item)
    }
    return (
      <Card num="2" title="Scope of Works">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <White>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: GREEN, letterSpacing: '0.08em' }}>✓ Included</p>
            {Object.entries(byTrade).map(([trade, items]) => (
              <div key={trade} className="mb-4">
                <p className="text-xs font-bold pb-1 mb-2" style={{
                  color: NAVY, fontVariant: 'small-caps', letterSpacing: '0.08em',
                  borderBottom: `1px solid ${NAVY}`, textTransform: 'uppercase', fontSize: '10px'
                }}>{trade}</p>
                {items.map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5 mb-1">
                    <span className="flex-shrink-0 font-bold text-xs" style={{ color: GREEN }}>✓</span>
                    <span className="text-xs" style={{ color: '#1A1A1A' }}>{item.element}</span>
                  </div>
                ))}
              </div>
            ))}
            {included.length === 0 && <p className="text-xs" style={{ color: '#64748B' }}>See narrative below.</p>}
          </White>
          <White>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: RED, letterSpacing: '0.08em' }}>✗ Excluded</p>
            {excluded.length > 0
              ? excluded.map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5 mb-1.5">
                    <span className="flex-shrink-0 font-bold text-xs" style={{ color: RED }}>✗</span>
                    <span className="text-xs" style={{ color: '#1A1A1A' }}>{item.element}{item.reason ? ` — ${item.reason}` : ''}</span>
                  </div>
                ))
              : <p className="text-xs" style={{ color: '#64748B' }}>No specific exclusions noted.</p>
            }
          </White>
        </div>
        {assumptionLines.length > 0 && (
          <White>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: NAVY }}>Assumptions</p>
            {assumptionLines.map((a, i) => (
              <div key={i} className="flex items-start gap-2 mb-1">
                <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: '#94A3B8' }}>—</span>
                <span className="text-xs" style={{ color: '#1A1A1A' }}>{a}</span>
              </div>
            ))}
          </White>
        )}
      </Card>
    )
  }

  // Fallback: render markdown scope content (parse included/excluded/assumptions from text)
  const mdLines = text.split('\n')
  const includedMd = [], excludedMd = [], assumptionsMd = []
  let currentList = null
  for (const l of mdLines) {
    const low = l.toLowerCase()
    if (low.includes('included')) { currentList = 'inc'; continue }
    if (low.includes('excluded')) { currentList = 'exc'; continue }
    if (low.includes('assumption')) { currentList = 'ass'; continue }
    if (/^[-*]\s/.test(l.trim())) {
      const item = l.replace(/^[-*]\s+/, '').trim()
      if (currentList === 'inc') includedMd.push(item)
      else if (currentList === 'exc') excludedMd.push(item)
      else if (currentList === 'ass') assumptionsMd.push(item)
    }
  }

  const hasLists = includedMd.length > 0 || excludedMd.length > 0

  return (
    <Card num="2" title="Scope of Works">
      {hasLists ? (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <White>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: GREEN, letterSpacing: '0.08em' }}>✓ Included</p>
              {includedMd.length > 0
                ? includedMd.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 mb-1">
                      <span className="flex-shrink-0 font-bold text-xs" style={{ color: GREEN }}>✓</span>
                      <span className="text-xs" style={{ color: '#1A1A1A' }}>{item}</span>
                    </div>
                  ))
                : <p className="text-xs" style={{ color: '#64748B' }}>See report text.</p>
              }
            </White>
            <White>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: RED, letterSpacing: '0.08em' }}>✗ Excluded</p>
              {excludedMd.length > 0
                ? excludedMd.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 mb-1.5">
                      <span className="flex-shrink-0 font-bold text-xs" style={{ color: RED }}>✗</span>
                      <span className="text-xs" style={{ color: '#1A1A1A' }}>{item}</span>
                    </div>
                  ))
                : <p className="text-xs" style={{ color: '#64748B' }}>No specific exclusions noted.</p>
              }
            </White>
          </div>
          {(assumptionsMd.length > 0 || assumptionLines.length > 0) && (
            <White>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: NAVY }}>Assumptions</p>
              {(assumptionsMd.length > 0 ? assumptionsMd : assumptionLines).map((a, i) => (
                <div key={i} className="flex items-start gap-2 mb-1">
                  <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: '#94A3B8' }}>—</span>
                  <span className="text-xs" style={{ color: '#1A1A1A' }}>{a}</span>
                </div>
              ))}
            </White>
          )}
        </>
      ) : (
        <White><Md text={text || '_Scope detail not available — regenerate the report._'} /></White>
      )}
    </Card>
  )
}

// ─── Section 3: Risk Register ─────────────────────────────────────────────────
function S3_Risks({ intel, md }) {
  const risks = intel?.topRiskSignals || []

  if (risks.length === 0) {
    return (
      <Card num="3" title="Top Risks Register">
        <White><Md text={extractSection(md, 'risk')} /></White>
      </Card>
    )
  }

  const counts = risks.reduce((acc, r) => { acc[r.rating] = (acc[r.rating] || 0) + 1; return acc }, {})

  return (
    <Card num="3" title="Top Risks Register">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {[['High', RED, '#fff'], ['Medium', AMBER, '#1A1A1A'], ['Low', GREEN, '#fff']].map(([lvl, bg, fg]) => (
          <span key={lvl} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
            style={{ backgroundColor: bg, color: fg }}>
            {counts[lvl] || 0} {lvl} impact
          </span>
        ))}
        <span className="text-xs" style={{ color: '#64748B' }}>{risks.length} risks total</span>
      </div>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ backgroundColor: NAVY }}>
                {['ID', 'Risk', 'Category', 'L', 'I', 'Rating', 'Mitigation'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-white whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {risks.map((r, i) => (
                <tr key={r.ref || i} className="border-b"
                  style={{ borderColor: '#F0F4F8', backgroundColor: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                  <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ color: NAVY }}>{r.ref}</td>
                  <td className="px-3 py-3" style={{ color: '#1A1A1A', maxWidth: '200px' }}>{r.description}</td>
                  <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#64748B' }}>{r.category}</td>
                  <td className="px-3 py-3"><Pill level={r.likelihood} /></td>
                  <td className="px-3 py-3"><Pill level={r.impact} /></td>
                  <td className="px-3 py-3"><Pill level={r.rating} /></td>
                  <td className="px-3 py-3" style={{ color: '#1A1A1A', maxWidth: '180px' }}>{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

// ─── Section 4: Programme ─────────────────────────────────────────────────────
function S4_Programme({ intel, md }) {
  const pf = intel?.programmeFlags

  if (!pf) {
    const text = extractSection(md, 'programme')
    // Try to extract achievability line from markdown
    const achieveLine = text.split('\n').find(l => /achievable|not achievable/i.test(l)) || ''
    const isAchievable = /\*\*is achievable\*\*/i.test(achieveLine) || (/achievable/i.test(achieveLine) && !/not achievable/i.test(achieveLine))
    const notAchievable = /not achievable/i.test(achieveLine)
    return (
      <Card num="4" title="High-Level Programme">
        {achieveLine && (
          <White className="mb-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{!notAchievable ? '✅' : '⚠️'}</span>
              <p className="text-sm" style={{ color: !notAchievable ? GREEN : RED }}>
                {achieveLine.replace(/\*\*/g, '').trim()}
              </p>
            </div>
          </White>
        )}
        <White><Md text={text} /></White>
      </Card>
    )
  }

  const total = pf.minimumProgrammeWeeks || 0
  // Use explicit designAllowanceWeeks if available; fall back to deriving from total
  const designWks = pf.designAllowanceWeeks
    ? pf.designAllowanceWeeks
    : Math.max(2,
        total
        - (pf.surveyAllowanceWeeks || 0)
        - (pf.tenderAllowanceWeeks || 0)
        - (pf.constructionAllowanceWeeks || 0)
        - 1 // handover
      )

  // Stage colours from spec: Surveys=amber, Design=navy, Tender=grey, Construction=green, Handover=blue
  const stages = [
    { label: 'Surveys',       weeks: pf.surveyAllowanceWeeks || 0,      color: AMBER,     textColor: '#1A1A1A' },
    { label: 'Design (S2–4)', weeks: designWks,                          color: NAVY,      textColor: '#FFFFFF' },
    { label: 'Tender',        weeks: pf.tenderAllowanceWeeks || 0,       color: '#888888', textColor: '#FFFFFF' },
    { label: 'Construction',  weeks: pf.constructionAllowanceWeeks || 0, color: GREEN,     textColor: '#FFFFFF' },
    { label: 'Handover',      weeks: 1,                                  color: BLUE,      textColor: '#FFFFFF' },
  ].filter(s => s.weeks > 0)

  // Gateway positions (cumulative %) after Design, Tender, Construction
  const gatewayAfter = new Set(['Design (S2–4)', 'Tender', 'Construction'])
  let cumPct = 0
  const gateways = []
  for (const s of stages) {
    cumPct += (s.weeks / total) * 100
    if (gatewayAfter.has(s.label)) gateways.push(cumPct)
  }

  return (
    <Card num="4" title="High-Level Programme">
      {/* Data boxes */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <DataBox
          label="Total Duration"
          value={total ? `${total} weeks (≈ ${Math.ceil(total / 4.3)} months)` : '—'}
        />
        <DataBox label="Procurement Route" value={intel?.procurementRecommendation?.route} />
      </div>

      {/* Achievability box */}
      <White className="mb-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">{pf.targetDateAchievable ? '✅' : '⚠️'}</span>
          <div>
            <p className="text-sm font-bold mb-1" style={{ color: pf.targetDateAchievable ? GREEN : RED }}>
              Target date {pf.targetDateAchievable ? 'is achievable' : 'is NOT achievable'}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#1A1A1A' }}>{pf.targetDateRationale}</p>
          </div>
        </div>
      </White>

      {/* Visual Gantt */}
      {total > 0 && stages.length > 0 && (
        <White className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: NAVY }}>Visual Programme</p>
          {/* Stage bars */}
          <div className="flex rounded overflow-hidden" style={{ height: '40px' }}>
            {stages.map((s, i) => (
              <div key={i} title={`${s.label}: ${s.weeks}w`}
                style={{ width: `${(s.weeks / total) * 100}%`, backgroundColor: s.color, minWidth: '4px' }}
                className="flex items-center justify-center overflow-hidden">
                {(s.weeks / total) > 0.12
                  ? <span className="font-bold px-1 truncate" style={{ fontSize: '9px', color: s.textColor }}>{s.label}</span>
                  : null
                }
              </div>
            ))}
          </div>
          {/* Gateway diamonds row */}
          {gateways.length > 0 && (
            <div className="relative" style={{ height: '22px' }}>
              {gateways.map((pct, i) => (
                <div key={i} style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', top: '2px' }}>
                  <span style={{ color: '#ED7D31', fontSize: '14px', lineHeight: 1 }} title={`Gateway ${i + 2}`}>◆</span>
                </div>
              ))}
            </div>
          )}
          {/* Week markers */}
          <div className="flex mb-3">
            {(() => {
              let cum = 0
              return stages.map((s, i) => {
                cum += s.weeks
                return (
                  <div key={i} style={{ width: `${(s.weeks / total) * 100}%`, textAlign: 'right', fontSize: '9px', color: '#94A3B8', paddingRight: '2px' }}>
                    w{cum}
                  </div>
                )
              })
            })()}
          </div>
          {/* Stage legend */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stages.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span style={{ color: '#1A1A1A' }}>{s.label}</span>
                <span className="ml-auto font-semibold" style={{ color: NAVY }}>{s.weeks}w</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: '#ED7D31', fontSize: '12px' }}>◆</span>
              <span style={{ color: '#64748B' }}>Gateway decision point</span>
            </div>
          </div>
        </White>
      )}

      {pf.programmeUpliftReason && (
        <White>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: NAVY }}>Programme Notes</p>
          <div className="flex items-start gap-2">
            <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: '#94A3B8' }}>—</span>
            <p className="text-xs leading-relaxed" style={{ color: '#1A1A1A' }}>{pf.programmeUpliftReason}</p>
          </div>
        </White>
      )}
    </Card>
  )
}

// ─── Section 5: Cost Estimate ─────────────────────────────────────────────────
function S5_Cost({ md, intel, meta }) {
  const text = extractSection(md, 'order of cost')
  const riskLevel = intel?.percentageAdditions?.risk?.riskLevel

  return (
    <Card num="5" title="Order of Cost Estimate (NRM1)">
      {/* Data boxes */}
      <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
        <DataBox label="GIFA" value={meta?.gifa ? `${Number(meta.gifa).toLocaleString()} m²` : '—'} />
        <DataBox label="Region" value={intel?.bcisRegion} />
        <DataBox label="Location Factor" value={intel?.bcisFactor ? intel.bcisFactor.toFixed(2) : '—'} />
        <DataBox label="Spec Level" value={intel?.specLevel} />
      </div>
      {/* Rate + risk pills */}
      {riskLevel && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Pill level={riskLevel} />
          <span className="text-xs" style={{ color: '#64748B' }}>Risk allowance: {intel.percentageAdditions?.risk?.low}%–{intel.percentageAdditions?.risk?.high}%</span>
        </div>
      )}
      {/* Markdown table from Layer 2 */}
      <White><Md text={text} /></White>
    </Card>
  )
}

// ─── Section 6: ROI ───────────────────────────────────────────────────────────
function S6_ROI({ md, num, meta }) {
  const text = extractSection(md, 'roi')
  if (!text) return null

  // Parse simple payback from narrative if available
  const paybackMatch = text.match(/(\d+\.?\d*)\s*years?\s*(?:simple\s*)?payback/i)
    || text.match(/payback[^£\d]*(\d+\.?\d*)\s*years?/i)
  const payback = paybackMatch ? `${paybackMatch[1]} years` : 'See narrative'

  return (
    <Card num={num} title="ROI & Financial Case">
      <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
        <DataBox label="Benefit Type"      value={meta?.benefitType || '—'} />
        <DataBox label="Annual Benefit"    value={meta?.annualBenefit || '—'} />
        <DataBox label="Project Cost (Mid)" value="See cost estimate" />
        <DataBox label="Simple Payback"    value={payback} />
      </div>
      <White><Md text={text} /></White>
    </Card>
  )
}

// ─── Section 7: Procurement ───────────────────────────────────────────────────
function S7_Procurement({ intel, md, num }) {
  const rec  = intel?.procurementRecommendation || {}
  const pf   = intel?.programmeFlags || {}
  const text = extractSection(md, 'procurement')

  // If intel has no route, try to extract it from the markdown text
  const mdRoute = !rec.route && text
    ? (text.match(/(?:Traditional|Design & Build|D&B|PCSA|Two-Stage)[^\n]*/i)?.[0]?.trim() || null)
    : null
  const displayRoute    = rec.route || mdRoute || null
  const displayContract = rec.contractForm || null

  if (!displayRoute && !text) return null

  const details = [
    { label: 'Contract Type',         value: rec.contractForm },
    { label: 'Tender Period',         value: pf.tenderAllowanceWeeks ? `${pf.tenderAllowanceWeeks} weeks` : null },
    { label: 'Design Responsibility', value: (rec.route || '').toLowerCase().includes('design') ? 'Contractor' : 'Employer' },
    { label: 'Procurement Route',     value: rec.route },
  ].filter(d => d.value)

  return (
    <Card num={num} title="Procurement Recommendation">
      {/* Highlighted route */}
      <div className="rounded-xl p-5 mb-4 text-center" style={{ backgroundColor: NAVY }}>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#94B4CC' }}>Recommended Route</p>
        <p className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>{displayRoute || '—'}</p>
        {displayContract && <p className="text-sm mt-1" style={{ color: '#D5E8F0' }}>{displayContract}</p>}
      </div>

      {/* Rationale */}
      {rec.rationale && (
        <White className="mb-4">
          <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{rec.rationale}</p>
        </White>
      )}

      {/* Detail grid */}
      {details.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {details.map(({ label, value }) => (
            <DataBox key={label} label={label} value={value} />
          ))}
        </div>
      )}

      {/* Markdown narrative if additional detail */}
      {text && !rec.rationale && (
        <White className="mb-4"><Md text={text} /></White>
      )}

      {/* Conflict flag */}
      {rec.conflicts && (
        <div className="bg-white rounded-xl p-4 flex items-start gap-3"
          style={{ border: `2px solid ${AMBER}` }}>
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: AMBER }}>Conflict Flag</p>
            <p className="text-xs" style={{ color: '#1A1A1A' }}>{rec.conflicts}</p>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Section 8: Constraints ───────────────────────────────────────────────────
function S8_Constraints({ md, num }) {
  const text = extractSection(md, 'constraint')
  if (!text) return null
  return (
    <Card num={num} title="Constraints Summary">
      <White><Md text={text} /></White>
    </Card>
  )
}

// ─── Section 9: Recommendations & Next Steps ─────────────────────────────────
function S9_Recommendations({ intel, md, num }) {
  const showstoppers = intel?.showstoppers || []
  const actions      = intel?.immediateActions || []

  // If intel arrays empty, try parsing from markdown
  if (!showstoppers.length && !actions.length) {
    const text = extractSection(md, 'recommendation') || extractSection(md, 'next step')
    if (!text) return null
    // Parse showstoppers, actions, gateways from markdown text
    const mdLines = text.split('\n')
    let section = null
    const parsedStop = [], parsedActions = [], parsedGateways = []
    for (const l of mdLines) {
      const low = l.toLowerCase()
      if (low.includes('showstopper')) { section = 'stop'; continue }
      if (low.includes('immediate action')) { section = 'act'; continue }
      if (low.includes('gateway')) { section = 'gw'; continue }
      const bullet = l.replace(/^[-*\d.]\s+/, '').trim()
      if (!bullet) continue
      if (section === 'stop' && /^[-*]\s/.test(l.trim())) parsedStop.push(bullet)
      else if (section === 'act' && /^\d+\./.test(l.trim())) parsedActions.push(bullet)
      else if (section === 'gw' && /^[-*]\s/.test(l.trim())) parsedGateways.push(bullet)
    }
    if (parsedStop.length || parsedActions.length) {
      return (
        <Card num={num} title="Recommendations & Next Steps">
          {parsedStop.length > 0 && (
            <div className="bg-white rounded-xl p-4 mb-4" style={{ border: `2px solid ${RED}` }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: RED }}>⛔ Showstoppers</p>
              {parsedStop.map((s, i) => (
                <div key={i} className="flex items-start gap-2 mb-2">
                  <span className="flex-shrink-0 font-bold text-xs mt-0.5" style={{ color: RED }}>!</span>
                  <p className="text-sm" style={{ color: '#1A1A1A' }}>{s}</p>
                </div>
              ))}
            </div>
          )}
          {parsedActions.length > 0 && (
            <White className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: NAVY }}>Immediate Actions</p>
              <ol className="space-y-2">
                {parsedActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: NAVY }}>{i + 1}</span>
                    <span className="text-sm pt-0.5" style={{ color: '#1A1A1A' }}>{a}</span>
                  </li>
                ))}
              </ol>
            </White>
          )}
          {parsedGateways.length > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(parsedGateways.length, 3)}, 1fr)` }}>
              {parsedGateways.map((g, i) => (
                <div key={i} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E2E8F0' }}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: BLUE }}>Gateway {i + 2}</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>{g}</p>
                </div>
              ))}
            </div>
          )}
          {!parsedStop.length && !parsedActions.length && !parsedGateways.length && (
            <White><Md text={text} /></White>
          )}
        </Card>
      )
    }
    return (
      <Card num={num} title="Recommendations & Next Steps">
        <White><Md text={text} /></White>
      </Card>
    )
  }

  return (
    <Card num={num} title="Recommendations & Next Steps">
      {/* Showstoppers */}
      {showstoppers.length > 0 && (
        <div className="bg-white rounded-xl p-4 mb-4" style={{ border: `2px solid ${RED}` }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: RED }}>
            ⛔ Showstoppers — Must Resolve Before Proceeding
          </p>
          {showstoppers.map((s, i) => (
            <div key={i} className="flex items-start gap-2 mb-2">
              <span className="flex-shrink-0 font-bold text-xs mt-0.5" style={{ color: RED }}>!</span>
              <p className="text-sm" style={{ color: '#1A1A1A' }}>{s}</p>
            </div>
          ))}
        </div>
      )}

    </Card>
  )
}

// ─── Disclaimer ───────────────────────────────────────────────────────────────
function Disclaimer() {
  return (
    <div className="mb-6 p-5 rounded-xl" style={{ backgroundColor: '#FFF3CD', border: `2px solid ${AMBER}` }}>
      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#1A1A1A' }}>
        Important Disclaimer
      </p>
      <p className="text-xs leading-relaxed italic" style={{ color: '#1A1A1A' }}>
        This feasibility report is indicative only, produced at RIBA Stage 0–1. The order of cost estimate is based
        on BCIS £/m² benchmarks and has not been produced from measured quantities or detailed design. This report
        should be reviewed by a Chartered Quantity Surveyor and construction professional before use in any business
        case, budget approval, or funding application.
      </p>
    </div>
  )
}

// ─── Word export ──────────────────────────────────────────────────────────────
async function buildDocxContent(reportText, projectName, meta) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
          HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType } = await import('docx')

  // ── Inline markdown parser — converts **bold** and *italic* into TextRun arrays ──
  function parseInline(text, baseOpts = {}) {
    const runs = []
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g
    let last = 0, m
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), ...baseOpts }))
      if (m[0].startsWith('**')) runs.push(new TextRun({ text: m[2], ...baseOpts, bold: true }))
      else                        runs.push(new TextRun({ text: m[3], ...baseOpts, italics: true }))
      last = m.index + m[0].length
    }
    if (last < text.length) runs.push(new TextRun({ text: text.slice(last), ...baseOpts }))
    return runs.length > 0 ? runs : [new TextRun({ text, ...baseOpts })]
  }

  const pageProps = {
    page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  }

  const commonStyles = {
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }],
      }],
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 20, color: '1A1A1A' } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', run: { font: 'Arial', size: 36, bold: true, color: '1F3864' }, paragraph: { spacing: { after: 200 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', run: { font: 'Arial', size: 26, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 400, after: 150 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', run: { font: 'Arial', size: 22, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 200, after: 100 } } },
      ],
    },
  }

  // ── Cover page ──────────────────────────────────────────────────────────────
  const generatedDate = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const score = meta?.confidenceScore || 'C'
  const confLabel = { A: 'High Confidence', B: 'Moderate Confidence', C: 'Limited Confidence', D: 'High Uncertainty' }[score] || 'Limited Confidence'

  const coverChildren = [
    new Paragraph({ text: '', spacing: { after: 800 } }),
    new Paragraph({
      children: [new TextRun({ text: 'RIBA STAGE 0–1 FEASIBILITY REPORT', font: 'Arial', size: 22, bold: true, color: '64748B', allCaps: true })],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [new TextRun({ text: projectName, font: 'Arial', size: 56, bold: true, color: '1F3864' })],
      spacing: { after: 560 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '1F3864' } },
      spacing: { after: 480 },
      children: [new TextRun({ text: '' })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Generated:  ', font: 'Arial', size: 20, bold: true, color: '64748B' }),
        new TextRun({ text: generatedDate, font: 'Arial', size: 20, color: '1A1A1A' }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Standard:   ', font: 'Arial', size: 20, bold: true, color: '64748B' }),
        new TextRun({ text: 'RIBA Stage 0–1', font: 'Arial', size: 20, color: '1A1A1A' }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Confidence: ', font: 'Arial', size: 20, bold: true, color: '64748B' }),
        new TextRun({ text: `${score} — ${confLabel}`, font: 'Arial', size: 20, color: '1A1A1A' }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Produced by:', font: 'Arial', size: 20, bold: true, color: '64748B' }),
        new TextRun({ text: ' Estates AI Tool', font: 'Arial', size: 20, color: '1A1A1A' }),
      ],
      spacing: { after: 800 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'This report is indicative only and has not been produced from measured quantities or detailed design. Refer to the disclaimer at the end of this report.', font: 'Arial', size: 18, italics: true, color: '94A3B8' })],
      spacing: { after: 0 },
    }),
  ]

  // ── Report body ─────────────────────────────────────────────────────────────
  const children = []
  const lines = reportText.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('# ') && !line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }))
      i++; continue
    }
    if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 150 } }))
      i++; continue
    }
    if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4).trim(), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }))
      i++; continue
    }
    if (line.trim() === '---') {
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }))
      i++; continue
    }
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      children.push(new Paragraph({
        children: parseInline(line.slice(2).trim(), { font: 'Arial', size: 20, color: '1A1A1A' }),
        bullet: { level: 0 },
        spacing: { after: 60 },
      }))
      i++; continue
    }
    if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({
        children: parseInline(line.replace(/^\d+\.\s/, '').trim(), { font: 'Arial', size: 20, color: '1A1A1A' }),
        numbering: { reference: 'default-numbering', level: 0 },
        spacing: { after: 60 },
      }))
      i++; continue
    }

    // Table detection
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1].startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!lines[i].match(/^\|[-| ]+\|$/)) tableLines.push(lines[i])
        i++
      }
      const rows = tableLines.map(l =>
        l.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim())
      )
      if (rows.length > 0) {
        children.push(new Table({
          rows: rows.map((cells, rowIdx) => new TableRow({
            children: cells.map(cell => new TableCell({
              children: [new Paragraph({
                children: parseInline(cell, { font: 'Arial', size: 18, bold: rowIdx === 0, color: rowIdx === 0 ? 'FFFFFF' : '1A1A1A' }),
              })],
              shading: rowIdx === 0
                ? { type: ShadingType.SOLID, color: '1F3864', fill: '1F3864' }
                : rowIdx % 2 === 0
                  ? { type: ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' }
                  : undefined,
              width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
            })),
          })),
          width: { size: 9000, type: WidthType.DXA },
        }))
        children.push(new Paragraph({ text: '', spacing: { after: 200 } }))
      }
      continue
    }

    if (line.toUpperCase().includes('DISCLAIMER:')) {
      children.push(new Paragraph({
        children: parseInline(line.trim(), { font: 'Arial', size: 18, color: '1A1A1A' }),
        shading: { type: ShadingType.SOLID, color: 'FFF3CD', fill: 'FFF3CD' },
        spacing: { before: 200, after: 200 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
          left: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
          right: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
        },
      }))
      i++; continue
    }

    if (line.trim()) {
      children.push(new Paragraph({
        children: parseInline(line.trim(), { font: 'Arial', size: 20, color: '1A1A1A' }),
        spacing: { after: 120 },
      }))
    }
    i++
  }

  children.push(new Paragraph({ text: '', spacing: { after: 400 } }))
  children.push(new Paragraph({
    children: [new TextRun({
      text: 'DISCLAIMER: This feasibility report is indicative only, produced at RIBA Stage 0-1 without measured quantities or detailed design. Rates are based on BCIS £/m² benchmarks. This should be reviewed by a Chartered Quantity Surveyor before use in any business case, budget approval, or funding application.',
      font: 'Arial', size: 18, color: '1A1A1A',
    })],
    shading: { type: ShadingType.SOLID, color: 'FFF3CD', fill: 'FFF3CD' },
    spacing: { before: 200, after: 200 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
      left: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
      right: { style: BorderStyle.SINGLE, size: 6, color: 'F4B942' },
    },
  }))

  const doc = new Document({
    ...commonStyles,
    sections: [
      { properties: pageProps, children: coverChildren },
      { properties: pageProps, children },
    ],
  })

  return Packer.toBuffer(doc)
}

// ─── Main report page ─────────────────────────────────────────────────────────
export default function ReportPage() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [wordGenerating, setWordGenerating] = useState(false)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('estatesAI_report')
      if (!stored) { router.push('/questionnaire'); return }
      setData(JSON.parse(stored))
    } catch { router.push('/questionnaire') }
  }, [router])

  function downloadPDF() {
    // Use browser print — produces proper page breaks and a compact PDF
    window.print()
  }

  async function downloadWord() {
    if (!data?.report) return
    setWordGenerating(true)
    try {
      const buffer = await buildDocxContent(data.report, data.projectName || 'Estates Project', data.meta)
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = (data?.projectName || 'Project').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
      const date = new Date().toISOString().split('T')[0]
      a.download = `${name}_RIBA_Stage1_${date}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Word export failed. Please try again.')
      console.error(err)
    } finally { setWordGenerating(false) }
  }

  if (!data) return null

  const intel  = data.intel  || null
  const md     = data.report || ''
  const meta   = data.meta   || {}
  const score  = meta.confidenceScore || 'C'
  const projectName = data.projectName || 'Estates Project'
  const generatedDate = meta.generatedAt
    ? new Date(meta.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // Determine optional sections
  const hasROI         = !!extractSection(md, 'roi')
  const hasProcurement = !!(extractSection(md, 'procurement') || intel?.procurementRecommendation?.route)
  const hasConstraints = !!extractSection(md, 'constraint')

  // Dynamic section numbers (1–5 are fixed)
  let n = 5
  const roiNum   = hasROI         ? ++n : null
  const procNum  = hasProcurement ? ++n : null
  const constNum = hasConstraints ? ++n : null
  const recNum   = ++n

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F0F4F8' }}>
      {/* Print CSS — PDF layout */}
      <style>{`
        @media print {
          @page { size: A4; margin: 1.2cm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          header { display: none !important; }
          button { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          .min-h-screen { background: white !important; }
          .max-w-4xl { max-width: 100% !important; padding: 0 !important; }
          .py-8 { padding-top: 0 !important; padding-bottom: 0 !important; }
          .px-4 { padding-left: 0 !important; padding-right: 0 !important; }
          #report-body { box-shadow: none !important; border-radius: 0 !important; max-width: 100% !important; }
          #cover-page { page-break-after: always; min-height: 85vh; display: flex; flex-direction: column; justify-content: center; }
          .section-card { page-break-inside: avoid; break-inside: avoid; border-radius: 4px !important; margin-bottom: 10px !important; }
          .rounded-xl, .rounded-2xl { border-radius: 4px !important; }
          h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
          table { page-break-inside: avoid; break-inside: avoid; width: 100% !important; }
          tr { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* Sticky app header */}
      <header className="sticky top-0 z-10 shadow" style={{ backgroundColor: NAVY }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-sm"
              style={{ backgroundColor: BLUE, color: '#FFFFFF' }}>AI</div>
            <span className="font-semibold" style={{ color: '#FFFFFF', fontSize: '16px' }}>Estates AI Tool</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => router.push('/questionnaire')}
              className="text-sm hover:underline" style={{ color: '#D5E8F0' }}>
              New Report
            </button>
            <button onClick={downloadPDF}
              className="flex items-center gap-1.5 rounded-lg font-semibold"
              style={{ backgroundColor: BLUE, color: '#FFFFFF', fontSize: '14px', padding: '8px 16px' }}>
              Download PDF
            </button>
            <button onClick={downloadWord} disabled={wordGenerating}
              className="flex items-center gap-1.5 rounded-lg font-semibold disabled:opacity-60"
              style={{ border: '2px solid #D5E8F0', color: '#D5E8F0', fontSize: '14px', padding: '8px 14px', backgroundColor: 'transparent' }}>
              {wordGenerating ? <><Spinner /> Generating…</> : 'Download Word'}
            </button>
          </div>
        </div>
      </header>

      {/* Report body */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div id="report-body" className="rounded-xl overflow-hidden shadow-lg bg-white">

          {/* Cover */}
          <CoverPage projectName={projectName} generatedDate={generatedDate} score={score} meta={meta} />

          {/* Sections */}
          <div className="p-6">
            <S1_Executive md={md} intel={intel} />
            <S2_Scope intel={intel} md={md} />
            <S3_Risks intel={intel} md={md} />
            <S4_Programme intel={intel} md={md} />
            <S5_Cost md={md} intel={intel} meta={meta} />
            {hasROI         && <S6_ROI         md={md} num={roiNum} meta={meta} />}
            {hasProcurement && <S7_Procurement  intel={intel} md={md} num={procNum} />}
            {hasConstraints && <S8_Constraints  md={md} num={constNum} />}
            <S9_Recommendations intel={intel} md={md} num={recNum} />

            <Disclaimer />

            {/* Footer meta */}
            <div className="pt-4 pb-2 flex flex-wrap gap-4 text-xs" style={{ borderTop: '1px solid #E2E8F0', color: '#94A3B8' }}>
              <span>Model: {meta.model || 'claude-sonnet-4-6'}</span>
              <span>Generated: {generatedDate}</span>
              {meta.contradictionsConfirmed && <span style={{ color: AMBER }}>Contradictions acknowledged</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
