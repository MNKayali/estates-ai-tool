/**
 * lib/docx/pages.js — one builder per page kind, mirroring app/report/doc/*.
 * Content and layout decisions come only from lib/reportContent.js; look only
 * from lib/reportStyle.js (through ./primitives.js). Each returns block
 * children (Paragraph | Table) for one page.
 */
import { TableRow, WidthType, AlignmentType, VerticalAlign, TabStopType, Paragraph } from 'docx'
import { BRAND, COLOURS, COVER_TYPE, TYPE, TABLES, LIMITS, PAGE, pxToDxa, widthsToDxa } from '../reportStyle.js'
import { fmtDate, programmeHeadline, UNVERIFIED_MARK } from '../reportShared.js'
import {
  coverTitle, coverTitleSize, coverSubtitle, coverFactRows, coverCostRange, confidenceWord, deriveCostRiskLevel, cleanReportText, vatPct,
  scopeStatement, scopeGroups, notInScopeLines, notPricedLines, prepareRisks, riskTableMode,
  selectMilestones, overviewSegments, programmeDetailRows, programmeNarrativeLines,
  costIntroText, worksRows, worksTableMode, worksGroupRows, lineQty, lineBasisWord, projectCostRows,
  percentageLines, costAssumptionLines, costExclusionLines, DISCLAIMER, dataSourcesSentence, fmtShortDate,
} from '../reportContent.js'
import { t, p, img, cell, band, table, pill, exactRow, rule, newTable, CONTENT_DXA, PAGE_DXA } from './primitives.js'
import { LOGOS, logoWidth, contactRows, contactLead } from '../brand.js'

const gap = (after = 120) => p(t(''), { after })
const h3 = text => p(t(text, { semi: true, color: COLOURS.navy, size: TYPE.subHeading }), { before: 220, after: 90, keepNext: true })
const bullets = lines => lines.map(l => p(t(l), { bullet: true, after: 50 }))
const numbered = lines => lines.map(l => p(t(l), { numbered: true, after: 80 }))
const SEG_FILL = {
  design: COLOURS.segDesign, governance: COLOURS.segGovernance, tender: COLOURS.segTender,
  construction: COLOURS.segConstruction, handover: COLOURS.segHandover, float: COLOURS.segFloatA,
}
const grid = (fractions, cells, width = CONTENT_DXA) => {
  const w = widthsToDxa(fractions, width)
  return newTable({ width: { size: width, type: WidthType.DXA }, columnWidths: w, rows: [new TableRow({ children: cells.map((c, i) => c(w[i])) })] })
}

// ─── Cover ───────────────────────────────────────────────────────────────────
export function coverPage(data, ctx) {
  const { answers, cost, programme, confidence, aiProse } = data
  const title = coverTitle(answers)
  const grade = confidence?.score || aiProse?.confidenceScore || 'B'
  const label = confidence?.label || aiProse?.confidenceLabel || 'Moderate Confidence'
  const W = PAGE_DXA.width
  const X = pxToDxa(PAGE.marginXPx)
  const inner = W - 2 * X
  const TOP = pxToDxa(PAGE.coverTopPx)
  const FOOT = pxToDxa(64)
  const BODY = PAGE_DXA.height - TOP - FOOT

  const top = exactRow(TOP, [cell([
    p(img(ctx.logos.wordmarkWhite, logoWidth(LOGOS.wordmarkWhite, 35), 35, BRAND.name), { before: 640, after: 0 }),
    // 9 px below the wordmark (135 twips); 0.32em tracking as twips (pt × 0.32 × 20).
    p(t(BRAND.tagline.toUpperCase(), { color: COLOURS.onNavyTagline, size: COVER_TYPE.tagline, tracking: Math.round(COVER_TYPE.tagline * 0.32 * 20) }), { before: 135, after: 1500 }),
    p(t('——  RIBA STAGE 0–1', { semi: true, color: COLOURS.amberOnDark, size: COVER_TYPE.eyebrow }), { after: 40 }),
    p(t('        FEASIBILITY REPORT', { color: COLOURS.onNavy, size: COVER_TYPE.eyebrow }), { after: 260 }),
    p(t(title, { semi: true, color: COLOURS.paper, size: coverTitleSize(title) === 'full' ? COVER_TYPE.title : COVER_TYPE.titleLong }), { after: 200 }),
    p(t('━━━', { color: COLOURS.amberOnDark, size: COVER_TYPE.subtitle }), { after: 120 }),
    p(t(coverSubtitle(answers, cost), { color: COLOURS.onNavy, size: COVER_TYPE.subtitle }), { after: 0 }),
  ], { width: W, fill: COLOURS.navyMid, margins: { top: 0, bottom: 0, left: X, right: X } })])

  const fig = (lbl, v, s) => [
    p(t(lbl.toUpperCase(), { size: COVER_TYPE.label, color: COLOURS.label }), { after: 60 }),
    p(t(v, { semi: true, size: COVER_TYPE.figure, color: COLOURS.navyText }), { after: 40 }),
    p(t(s, { size: COVER_TYPE.figureNote, color: COLOURS.greyMute }), { after: 0 }),
  ]
  const figTop = { top: rule(COLOURS.navy, 18) }
  const figs = grid([0.42, 0.29, 0.29], [
    w => cell(fig('Total project cost', coverCostRange(cost), 'excl. VAT'), { width: w, borders: figTop, margins: { top: 160, bottom: 0, left: 0, right: 240 } }),
    w => cell(fig('Programme', `${programme?.totalWeeks ?? '—'} weeks`, programme?.floatWeeks > 0 ? `incl. ${programme.floatWeeks} weeks float` : 'critical path'), { width: w, borders: figTop, margins: { top: 160, bottom: 0, left: 0, right: 240 } }),
    w => cell(fig('Confidence', `Grade ${grade}`, `${confidenceWord(label)} · cost risk ${deriveCostRiskLevel(cost, aiProse).toLowerCase()}`), { width: w, borders: figTop, margins: { top: 160, bottom: 0, left: 0, right: 0 } }),
  ], inner)

  const facts = (rows, width) => newTable({
    width: { size: width, type: WidthType.DXA },
    columnWidths: widthsToDxa([0.46, 0.54], width),
    rows: rows.map(([k, v], i) => new TableRow({ children: [
      cell(p(t(k, { size: COVER_TYPE.facts, color: COLOURS.greyMute }), { after: 0 }), { borders: { bottom: rule(COLOURS.rule), ...(i === 0 ? { top: rule(COLOURS.navy, 10) } : {}) }, margins: { top: 110, bottom: 110, left: 0, right: 100 } }),
      cell(p(t(v, { size: COVER_TYPE.facts, color: COLOURS.navyText, mono: k === 'Reference' }), { after: 0 }), { borders: { bottom: rule(COLOURS.rule), ...(i === 0 ? { top: rule(COLOURS.navy, 10) } : {}) }, margins: { top: 110, bottom: 110, left: 0, right: 0 } }),
    ] })),
  })
  const left = coverFactRows(answers, cost)
  const right = [['Report date', ctx.dateLong], ['Reference', ctx.reference], ['Status', 'Indicative']]
  const factsRow = grid([0.52, 0.48], [
    w => cell(facts(left, w - 500), { width: w, margins: { top: 0, bottom: 0, left: 0, right: 500 } }),
    w => cell(facts(right, w), { width: w, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
  ], inner)

  const body = exactRow(BODY, [cell([
    figs,
    gap(520),
    factsRow,
    p(t('Order of cost estimate from benchmark rates, not measured quantities. Not for financial commitment without review by a Chartered Quantity Surveyor.', { size: COVER_TYPE.note, color: COLOURS.greyMute }), { before: 380 }),
  ], { width: W, margins: { top: 620, bottom: 0, left: X, right: X } })])

  const foot = exactRow(FOOT, [cell(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: inner }],
    children: [
      t(`${BRAND.name.toUpperCase()}   |   FEASIBILITY REPORT`, { size: COVER_TYPE.foot, color: COLOURS.onNavy }),
      t(`\tRef ${ctx.reference} · ${ctx.dateLong}`, { size: COVER_TYPE.note, color: COLOURS.onNavy }),
    ],
  }), { width: W, fill: COLOURS.navyDeep, vAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: X, right: X } })])

  return [newTable({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [top, body, foot] })]
}

// ─── Page 2: summary ─────────────────────────────────────────────────────────
export function summaryPage(data, ctx) {
  const { cost, programme, aiProse, budget } = data
  const m = ctx.money
  const stat = (lbl, v, s) => [
    p(t(lbl.toUpperCase(), { size: TYPE.small, color: COLOURS.label }), { after: 40 }),
    p(t(v, { semi: true, size: TYPE.statFigure, color: COLOURS.navy }), { after: 30 }),
    p(t(s, { size: TYPE.small, color: COLOURS.grey }), { after: 0 }),
  ]
  const top = { top: rule(COLOURS.navy, 18) }
  const strip = grid([0.41, 0.295, 0.295], [
    w => cell(stat('Total project cost', `${m(cost?.total?.low)} – ${m(cost?.total?.high)}`, `Excl. VAT · ${m(cost?.vat)} VAT at ${vatPct(cost)}% (mid-point, for reference)`), { width: w, fill: COLOURS.tintGroup, borders: top }),
    w => cell(stat('Programme', `${programme?.totalWeeks ?? '—'} weeks`, programme?.floatWeeks > 0 ? `Incl. ${programme.floatWeeks} weeks float · best case ${programme.totalWeeksBestCase} weeks` : 'Critical path, no float'), { width: w, fill: COLOURS.tintGroup, borders: top }),
    w => cell(stat('BCIS region', cost?.bcisRegion || '—', `Location factor ${cost?.bcisFactor ?? '—'}`), { width: w, fill: COLOURS.tintGroup, borders: top }),
  ])
  const out = [strip, gap(260), band(1, 'Executive Summary'), gap(160)]
  if (aiProse?.executiveSummary) out.push(p(t(cleanReportText(aiProse.executiveSummary))))
  if (aiProse?.keyFindings?.length) out.push(h3('Key findings'), ...bullets(aiProse.keyFindings.map(cleanReportText)))
  if (budget && budget.status !== 'none' && budget.note) {
    const colour = budget.status === 'insufficient' ? COLOURS.ragHigh : budget.status === 'tight' ? COLOURS.warn : COLOURS.pass
    const word = { sufficient: 'sufficient', tight: 'tight', insufficient: 'shortfall' }[budget.status] || budget.status
    out.push(gap(80), table({ widths: [1], rows: [{ kind: 'row', cells: [p([t(`Budget check: ${word}. `, { semi: true, color: colour, size: TYPE.table }), t(budget.note, { size: TYPE.table })], { after: 0 })] }] }))
  }
  if (programme?.targetStatus === 'at-risk' && programme.targetNote) {
    out.push(gap(80), table({ widths: [1], rows: [{ kind: 'row', cells: [p([t('Target date: ', { semi: true, color: COLOURS.warn, size: TYPE.table }), t(programme.targetNote, { size: TYPE.table })], { after: 0 })] }] }))
  }
  return out
}

// ─── Page 3: scope ───────────────────────────────────────────────────────────
// The included-works grid, as on screen: three columns; a group with more than
// four items spans two and lists its items in two columns.
function scopeGrid(groups) {
  const unit = Math.floor(CONTENT_DXA / 3)
  const rows = []
  let row = [], used = 0
  const flush = () => { if (row.length) { if (used < 3) row.push({ span: 3 - used, empty: true }); rows.push(row) } row = []; used = 0 }
  for (const g of groups) {
    const span = g.items.length > 4 ? 2 : 1
    if (used + span > 3) flush()
    row.push({ g, span }); used += span
  }
  flush()
  const head = g => p(t(g.label.toUpperCase(), { semi: true, size: TYPE.small, color: COLOURS.navy }), { after: 40, line: 252 })
  const items = list => list.map(it => p(t(it, { size: TYPE.table }), { bullet: true, after: 20, line: 252 }))
  const pad = { top: 80, bottom: 120, left: 0, right: 200 }
  const top = { top: rule(COLOURS.navy, 12) }
  return newTable({
    width: { size: unit * 3, type: WidthType.DXA },
    columnWidths: [unit, unit, unit],
    rows: rows.map(r => new TableRow({ cantSplit: true, children: r.map(c => {
      if (c.empty) return cell(p(t('')), { width: unit * c.span, span: c.span > 1 ? c.span : undefined, margins: pad })
      if (c.span === 1) return cell([head(c.g), ...items(c.g.items)], { width: unit, borders: top, margins: pad })
      const half = Math.ceil(c.g.items.length / 2)
      return cell([head(c.g), grid([0.5, 0.5], [
        w => cell(items(c.g.items.slice(0, half)), { width: w, margins: { top: 0, bottom: 0, left: 0, right: 120 } }),
        w => cell(items(c.g.items.slice(half)), { width: w, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      ], unit * 2 - 200)], { width: unit * 2, span: 2, borders: top, margins: pad })
    }) })),
  })
}

export function scopePage(data) {
  const { cost, aiProse } = data
  const out = [band(2, 'Scope of Works'), gap(160), p(t(scopeStatement(cost, data.answers))), h3('Included works'), scopeGrid(scopeGroups(cost))]
  const assumptions = aiProse?.scopeAssumptions?.length
    ? aiProse.scopeAssumptions.map(cleanReportText)
    : ['Scope to be confirmed after surveys and Stage 2 design.']
  out.push(grid([0.5, 0.5], [
    w => cell([h3('Scope assumptions'), ...bullets(assumptions)], { width: w, margins: { top: 0, bottom: 0, left: 0, right: 240 } }),
    w => cell([h3('Not in scope'), ...bullets(notInScopeLines(cost))], { width: w, margins: { top: 0, bottom: 0, left: 240, right: 0 } }),
  ]))
  const np = notPricedLines(cost)
  if (np.length) out.push(h3('Selected but not priced'), ...bullets(np))
  return out
}

// ─── Page 4: risk register ───────────────────────────────────────────────────
export function riskPage(data) {
  const { risks, counts } = prepareRisks(data.aiProse?.riskRegister)
  const out = [band(3, 'Risk Register', `Ordered by rating · ${LIMITS.maxRisks} risks at most`), gap(160)]
  if (!risks.length) return [...out, p(t('No risk register data available.', { color: COLOURS.grey }))]
  const badge = (n, word, fill) => [t(` ${n} `, { semi: true, color: COLOURS.paper, fill, size: TYPE.table }), t(` ${word}     `, { semi: true, size: TYPE.table })]
  out.push(p([...badge(counts.High, 'High', COLOURS.ragHigh), ...badge(counts.Medium, 'Medium', COLOURS.ragMed), ...badge(counts.Low, 'Low', COLOURS.ragLow)], { after: 160 }))
  const size = riskTableMode(risks) === 'compact' ? TYPE.small : TYPE.table
  out.push(table({
    widths: TABLES.risk,
    head: ['Ref', 'Category', 'Description', 'Rating', 'Mitigation'],
    size,
    rows: risks.map(r => ({
      kind: r.rating === 'High' ? 'high' : r.rating === 'Low' ? 'low' : 'med',
      cells: [p(t(r.ref, { mono: true, size, color: COLOURS.navy }), { after: 0 }), r.category, r.description, pill(r.rating), r.mitigation],
    })),
  }))
  return out
}

// ─── Page 5: programme ───────────────────────────────────────────────────────
export function programmePage(data) {
  const pr = data.programme || {}
  const ms = selectMilestones(pr)
  const segs = overviewSegments(pr)
  const total = pr.totalWeeks || 0
  const out = [band(4, 'High-Level Programme', programmeHeadline(pr)), gap(120), h3('Key milestones')]
  out.push(table({
    widths: [0.08, 0.52, 0.28, 0.12],
    numeric: [3],
    rows: ms.map(m => ({ kind: 'row', cells: [
      p(t(m.id, { semi: true, size: TYPE.table, color: COLOURS.amberText }), { after: 0 }),
      m.label,
      p(t(fmtDate(m.date), { size: TYPE.table, color: m.missedTarget ? COLOURS.ragHigh : COLOURS.ink, semi: m.missedTarget }), { after: 0 }),
      `wk ${m.week}`,
    ] })),
  }))
  if (segs.length) {
    const segW = widthsToDxa(segs.map(s => s.pct / 100), CONTENT_DXA)
    out.push(gap(200), newTable({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      columnWidths: segW,
      rows: [exactRow(620, segs.map((s, i) => cell(
        p(t(s.narrow ? `${s.weeks}w` : `${s.label} · ${s.weeks} wks`, { semi: true, size: TYPE.small, color: s.category === 'float' ? COLOURS.ink : COLOURS.paper }), { after: 0, align: AlignmentType.CENTER }),
        { width: segW[i], fill: SEG_FILL[s.category] || COLOURS.segOther, vAlign: VerticalAlign.CENTER, borders: { right: rule(COLOURS.paper, 8) }, margins: { top: 0, bottom: 0, left: 20, right: 20 } },
      )))],
    }))
    out.push(p(ms.map((m, i) => t(`${i ? '     ' : ''}◆ ${m.id} ${fmtDate(m.date)}`, { size: TYPE.small, color: COLOURS.amberText })), { before: 80, after: 40 }))
  }
  out.push(h3('Programme detail'), table({
    widths: TABLES.programme,
    head: ['Stage', 'Activity', 'Start', 'End', 'Wks'],
    numeric: [4],
    rows: [
      ...programmeDetailRows(pr).map(r => ({ kind: 'row', cells: [
        p(t(`${r.stage}${r.parallel ? ' ∥' : ''}`, { semi: true, size: TYPE.table, color: COLOURS.navy }), { after: 0 }),
        r.activity, fmtShortDate(r.start), fmtShortDate(r.end), r.parallel ? `(${r.weeks})` : String(r.weeks),
      ] })),
      { kind: 'total', cells: ['Total', '', fmtShortDate(pr.startDate), fmtShortDate(pr.endDate), String(total)] },
    ],
  }))
  out.push(h3('Programme narrative and assumptions'), ...bullets(programmeNarrativeLines(pr)))
  return out
}

// ─── Pages 6–7: cost ─────────────────────────────────────────────────────────
const worksLineRows = (rows, m) => rows.map(r => (r.type === 'group'
  ? { kind: 'group', cells: [r.label.toUpperCase()] }
  : { kind: 'row', cells: [
      p(t(r.item.code, { mono: true, size: TYPE.small, color: COLOURS.code }), { after: 0 }),
      `${r.item.description}${r.item.aiEstimate ? ` ${UNVERIFIED_MARK}` : ''}`,
      lineQty(r.item), lineBasisWord(r.item), m(r.low ?? r.item.lineLow, true), m(r.high ?? r.item.lineHigh, true),
    ] }))

export function costWorksPage(data, ctx) {
  const { cost, aiProse } = data
  const m = ctx.money
  const mode = worksTableMode(cost)
  const out = [
    band(5, 'Order of Cost Estimate', '1 of 2 · Works cost'), gap(160),
    p(t(aiProse?.costNarrative ? cleanReportText(aiProse.costNarrative) : costIntroText(cost, data.answers), { color: COLOURS.grey })),
  ]
  if (mode === 'lines') {
    out.push(table({
      widths: TABLES.works, head: ['Code', 'Element', 'Qty', 'Basis', 'Low £', 'High £'], numeric: [2, 4, 5],
      rows: [...worksLineRows(worksRows(cost), m), { kind: 'total', cells: ['', 'Works cost total', '', '', m(cost?.works?.low, true), m(cost?.works?.high, true)] }],
    }))
  } else {
    out.push(table({
      widths: TABLES.worksGroups, head: ['Element group', 'Items', 'Low £', 'High £'], numeric: [1, 2, 3],
      rows: [
        ...worksGroupRows(cost).map(g => ({ kind: 'row', cells: [g.label, String(g.count), m(g.low, true), m(g.high, true)] })),
        { kind: 'total', cells: ['Works cost total', '', m(cost?.works?.low, true), m(cost?.works?.high, true)] },
      ],
    }))
  }
  const unverified = (cost?.lineItems || []).some(l => l.aiEstimate)
  out.push(p(t(`${mode === 'groups' ? 'Full line-by-line breakdown in Appendix A. ' : ''}${unverified ? `${UNVERIFIED_MARK} Rate marked for verification in the rates workbook. ` : ''}Low and high reflect the estimate range; see the next page.`, { size: TYPE.small, color: COLOURS.greyMute }), { before: 80 }))
  return out
}

export function costSummaryPage(data, ctx) {
  const { cost, answers } = data
  const m = ctx.money
  const out = [band(5, 'Order of Cost Estimate', '2 of 2 · Project cost'), gap(160)]
  out.push(table({
    widths: TABLES.projectCost, head: ['Item', 'Rate', 'Low £', 'High £'], numeric: [2, 3],
    rows: projectCostRows(cost).map(r => ({ kind: r.kind, cells: [r.label, r.rate, m(r.low, true), m(r.high, true)] })),
  }))
  const pl = percentageLines(cost)
  if (pl.length) out.push(h3('How the percentages were set'), ...pl.map(l => p([t(`${l.name} ${l.pct}: `, { semi: true }), t(`${l.text}.`)], { bullet: true, after: 50 })))
  out.push(grid([0.5, 0.5], [
    w => cell([h3('Cost assumptions'), ...bullets(costAssumptionLines(cost, data.answers))], { width: w, margins: { top: 0, bottom: 0, left: 0, right: 240 } }),
    w => cell([h3('Cost exclusions'), ...bullets(costExclusionLines(cost, answers))], { width: w, margins: { top: 0, bottom: 0, left: 240, right: 0 } }),
  ]))
  return out
}

// ─── Late sections (half-page slots decided by layoutLateSections) ───────────
export function lateSection(key, no, data, ctx) {
  const a = data.aiProse || {}
  const pr = data.programme || {}
  if (key === 'roi') {
    const roi = ctx.roi
    const m = ctx.money
    const b = data.answers?.q5_1_financialBenefit
    const benefit = Array.isArray(b) ? b.join(', ') : (b || '—')
    const fig = (lbl, v, small = false) => w => cell([
      p(t(lbl.toUpperCase(), { size: TYPE.small, color: COLOURS.label }), { after: 40 }),
      p(t(v, { semi: true, size: small ? TYPE.table : TYPE.statFigure, color: COLOURS.navy }), { after: 0 }),
    ], { width: w, borders: { top: rule(COLOURS.navy, 18) }, margins: { top: 120, bottom: 0, left: 0, right: 200 } })
    return [
      band(no, 'Financial Case'), gap(140),
      grid([0.25, 0.25, 0.25, 0.25], [fig('Project cost (mid)', m(roi?.mid)), fig('Annual benefit', roi?.annual ? m(roi.annual) : 'Not stated', !roi?.annual), fig('Simple payback', roi?.paybackYears ? `${roi.paybackYears} years` : 'Needs an annual figure', !roi?.paybackYears), fig('Benefit type', benefit, true)]),
      gap(160),
      ...(a.roiNarrative ? [p(t(cleanReportText(a.roiNarrative)))] : []),
    ]
  }
  if (key === 'procurement') {
    const design = String(a.procurementDesignResp || pr.designResponsibility || '').toLowerCase()
    const kvRow = (k, v) => ({ kind: 'row', cells: [p(t(k, { size: TYPE.table, color: COLOURS.greyMute }), { after: 0 }), p(t(v, { size: TYPE.table, color: COLOURS.navy, semi: true }), { after: 0 })] })
    return [
      band(no, 'Procurement Recommendation'), gap(140),
      table({ widths: [0.32, 0.68], rows: [
        kvRow('Route', a.procurementRoute || pr.procurementRoute || ''),
        kvRow('Contract', a.procurementContractForm || pr.contractForm || ''),
        kvRow('Tender type · design', `${a.procurementTenderType || pr.tenderType || ''}${design ? ` · ${design}` : ''}`),
      ] }),
      ...(a.procurementNarrative ? [p(t(cleanReportText(a.procurementNarrative)), { before: 140 })] : []),
      ...(a.procurementConsiderations?.length ? [h3('Commercial considerations'), ...bullets(a.procurementConsiderations.map(cleanReportText))] : []),
      ...(a.procurementConflicts?.length ? a.procurementConflicts.map(c => p(t(cleanReportText(c), { color: COLOURS.warn }), { bullet: true, after: 50 })) : []),
    ]
  }
  return [
    band(no, 'Constraints Summary'), gap(140),
    table({
      widths: TABLES.constraints, head: ['Category', 'Constraint', 'Impact'],
      rows: (a.constraints || []).map(c => ({ kind: 'row', cells: [c.category, p(t(cleanReportText(c.title), { semi: true, size: TYPE.table }), { after: 0 }), cleanReportText(c.text)] })),
    }),
  ]
}

// ─── Last page ───────────────────────────────────────────────────────────────
export function lastPage(data, ctx, no) {
  const { aiProse, cost, programme } = data
  const kv = (k, v) => ({ kind: 'row', cells: [p(t(k, { size: TYPE.table, color: COLOURS.greyMute }), { after: 0 }), p(t(v, { size: TYPE.table, color: COLOURS.navy, semi: true }), { after: 0 })] })
  const contact = grid([0.32, 0.68], [
    w => cell([
      p(img(ctx.logos.lockup, logoWidth(LOGOS.lockup, 24), 24, BRAND.name), { after: 80 }),
      p(t(BRAND.descriptor, { size: TYPE.small, color: COLOURS.greyMute }), { after: 0 }),
    ], { width: w, fill: COLOURS.tintBand, borders: { top: rule(COLOURS.navy, 24) }, margins: { top: 260, bottom: 260, left: 240, right: 160 } }),
    w => cell([
      p(t('Further information', { semi: true, color: COLOURS.navy, size: TYPE.subHeading }), { after: 80 }),
      p([t(contactLead(), { size: TYPE.table }), t(ctx.reference, { mono: true, size: TYPE.table }), t('.', { size: TYPE.table })], { after: contactRows().length ? 120 : 0 }),
      // A Word table with no rows makes the file unreadable, so none is built without details.
      ...(contactRows().length ? [table({ widths: [0.22, 0.78], width: w - 500, rows: contactRows().map(([k, v]) => kv(k, v)) })] : []),
    ], { width: w, fill: COLOURS.tintBand, borders: { top: rule(COLOURS.navy, 24) }, margins: { top: 260, bottom: 260, left: 200, right: 300 } }),
  ])
  return [
    band(no, 'Recommendations and Next Steps'), gap(160),
    ...(aiProse?.nextSteps?.length ? numbered(aiProse.nextSteps.map(cleanReportText)) : [p(t('Commission outstanding surveys and appoint a design team to proceed to RIBA Stage 2.'))]),
    p(t('Disclaimer', { semi: true, color: COLOURS.navy, size: TYPE.table }), { before: 360, after: 60 }),
    p(t(`${DISCLAIMER} ${dataSourcesSentence(cost, programme)}`, { size: TYPE.small, color: COLOURS.greyMute }), { after: 480 }),
    contact,
  ]
}

// ─── Appendix A ──────────────────────────────────────────────────────────────
export function appendixPage(data, ctx, page) {
  const m = ctx.money
  const last = page.part === page.parts
  return [
    band('A', 'Appendix A · Works cost, line by line', `Part ${page.part} of ${page.parts}`), gap(160),
    table({
      widths: TABLES.works, head: ['Code', 'Element', 'Qty', 'Basis', 'Low £', 'High £'], numeric: [2, 4, 5],
      rows: [...worksLineRows(page.rows, m), ...(last ? [{ kind: 'total', cells: ['', 'Works cost total', '', '', m(data.cost?.works?.low, true), m(data.cost?.works?.high, true)] }] : [])],
    }),
  ]
}
