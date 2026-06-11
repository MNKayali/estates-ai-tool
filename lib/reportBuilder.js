/**
 * reportBuilder.js — Builds a Word document (.docx) matching the production template.
 *
 * Design spec (mirrors app/report/ReportRenderer.jsx):
 *   Primary navy:   #1A2E4A   Amber accent: #C4861A   Label gray: #9AA3AD
 *   Mid gray:       #7E93AD   Alt row bg:   #F4F1EA   Border:     #D9D3C7
 *   Fonts: Playfair Display headings (serif fallback), Arial body
 *   Page: A4 (11906 × 16838 DXA)   Margins: 1440 DXA
 *
 * Uses docx v9 (ESM named exports). Returns Buffer.
 *
 * SECURITY: Never reference AI_API_KEY here.
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, WidthType, BorderStyle, ShadingType,
  VerticalAlign, PageNumber, PageBreak, LevelFormat,
} from 'docx'

// ─── Colour palette ───────────────────────────────────────────────────────────
const NAVY    = '1A2E4A'
const AMBER    = 'C4861A'   // warm accent — used sparingly
const AMBER_LT = 'D9A94F'   // amber on navy (cover subtitle)
const GRAY    = '9AA3AD'
const MID_GR  = '7E93AD'
const ALT_ROW = 'F4F1EA'    // warm alternating row tint
const BORDER  = 'D9D3C7'
const WHITE   = 'FFFFFF'
const TXT     = '1A2E4A'
const SUBTXT  = '555555'

// ─── Page geometry ─────────────────────────────────────────────────────────────
const W = 9026   // content width DXA  (11906 − 2×1440)

// ─── Formatters ───────────────────────────────────────────────────────────────
const f    = n => `£${Math.round(n || 0).toLocaleString('en-GB')}`
const f1k  = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
const f100 = n => `£${(Math.round((n || 0) / 100)  * 100).toLocaleString('en-GB')}`
const pct = n  => `${Math.round((n || 0) * 10) / 10}%`
const fmt  = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

function calcRoi(answers, cost) {
  const annual = Number(answers.q5_2_annualBenefit) || 0
  const low    = cost?.total?.low
  const high   = cost?.total?.high
  if (!annual || !low || !high) return null
  // Mid-point of the published cost range, so the figure shown here is consistent
  // with the headline range rather than the separately-rounded model mid.
  const mid = Math.round(((low + high) / 2) / 1000) * 1000
  return { annual, mid, paybackYears: Math.round((mid / annual) * 10) / 10 }
}

// ─── Border helpers ───────────────────────────────────────────────────────────
const NONE = { style: BorderStyle.NONE, size: 0, color: WHITE }
const NO_B = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideH: NONE, insideV: NONE }

function thinB(c = BORDER) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: c }
  return { top: b, bottom: b, left: b, right: b }
}

// ─── Run / paragraph helpers ──────────────────────────────────────────────────
function sanitize(text) {
  if (text == null) return ''
  // Strip XML 1.0 invalid characters (control chars that Word cannot parse)
  return String(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

function run(text, sz = 20, color = TXT, bold = false, italic = false) {
  return new TextRun({ text: sanitize(text), font: 'Arial', size: sz, color, bold, italic })
}

// Display headings — Playfair Display where installed; Word substitutes a
// serif automatically when it is not, so the document always remains legible.
function headRun(text, sz = 24, color = NAVY, bold = true) {
  return new TextRun({ text: sanitize(text), font: 'Playfair Display', size: sz, color, bold })
}

function pageNum(sz = 14, color = GRAY) {
  return new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: sz, color })
}

function para(children, { before = 0, after = 80, align = AlignmentType.LEFT, num } = {}) {
  const opts = {
    children: Array.isArray(children) ? children : [children],
    spacing: { before, after },
    alignment: align,
  }
  if (num) opts.numbering = num
  return new Paragraph(opts)
}

const empty = () => para([run('', 20)])

// Bullet / numbered helpers
const bul = (text, ref = 'bullets') =>
  para([run(String(text ?? ''), 20, TXT)], { after: 40, num: { reference: ref, level: 0 } })

const num2 = text => bul(text, 'ordered')

// ─── Numbering config ─────────────────────────────────────────────────────────
const NUM_CFG = [
  {
    reference: 'bullets',
    levels: [{
      level: 0, format: LevelFormat.BULLET, text: '•',
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360, hanging: 200 } } },
    }],
  },
  {
    reference: 'ordered',
    levels: [{
      level: 0, format: LevelFormat.DECIMAL, text: '%1.',
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360, hanging: 220 } } },
    }],
  },
]

// ─── Table helpers ────────────────────────────────────────────────────────────
function cell(children, { w: cw, bg, borders, margins, valign, span } = {}) {
  const opts = {
    children: Array.isArray(children) ? children : [children],
    width: { size: cw || W, type: WidthType.DXA },
    margins: margins || { top: 80, bottom: 80, left: 140, right: 140 },
    borders: borders || NO_B,
  }
  if (bg)     opts.shading = { fill: bg, type: ShadingType.CLEAR }
  if (valign) opts.verticalAlign = valign
  if (span)   opts.columnSpan = span
  return new TableCell(opts)
}

function hdrCell(text, cw, { align = AlignmentType.LEFT } = {}) {
  return cell(
    para([run(text, 18, WHITE, true)], { align, after: 0 }),
    { w: cw, bg: NAVY, borders: NO_B }
  )
}

function tblRow(cells) {
  return new TableRow({ children: cells })
}

function tbl(rows, cols) {
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: cols,
    borders: NO_B,
    rows,
  })
}

function altRow(i) { return i % 2 === 0 ? ALT_ROW : WHITE }

// ─── Header & Footer ──────────────────────────────────────────────────────────
function buildHeader(projName) {
  return new Header({
    children: [
      para(
        [run(`${projName} — RIBA Stage 0–1 Feasibility Report`, 15, GRAY)],
        { after: 0 }
      )
    ],
  })
}

function buildFooter() {
  return new Footer({
    children: [
      para(
        [run('Estates AI Tool  |  Page ', 14, GRAY), pageNum(), run('  |  This report is indicative only.', 14, GRAY)],
        { align: AlignmentType.CENTER, after: 0 }
      )
    ],
  })
}

// ─── Section header ───────────────────────────────────────────────────────────
// Left amber accent bar + thin bottom rule, mirroring the on-screen renderer.
function sectionHdr(number, title) {
  return [
    para([run('', 20)], { before: 240, after: 0 }),
    tbl(
      [tblRow([
        cell(
          [
            para([run(`SECTION ${number}`, 14, GRAY, true)], { after: 30 }),
            para([headRun(title, 26)], { after: 0 }),
          ],
          {
            w: W,
            borders: {
              top: NONE,
              bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER },
              left: { style: BorderStyle.SINGLE, size: 24, color: AMBER },
              right: NONE,
            },
            margins: { top: 40, bottom: 80, left: 200, right: 120 },
            valign: VerticalAlign.CENTER,
          }
        ),
      ])],
      [W]
    ),
    para([run('', 20)], { after: 0 }),
  ]
}

// ─── Sub-heading ──────────────────────────────────────────────────────────────
function subHdr(text) {
  return para([run(text, 20, NAVY, true)], { before: 160, after: 60 })
}

// ─── Info boxes (3-column metric panel) ───────────────────────────────────────
function infoBoxes(cost, programme) {
  const bw = Math.floor(W / 3)            // ~3008 each; give remainder to last
  const bw3 = W - bw * 2                  // remainder
  const targetNote = programme?.targetNote || ''
  const targetColor = programme?.targetStatus === 'at-risk' ? 'C0392B' : '2A7A4B'

  function box(label, value, note, noteColor, w = bw) {
    const b = thinB(BORDER)
    return cell(
      [
        para([run(label, 15, GRAY, true)], { after: 40 }),
        para([run(value, 22, NAVY, true)], { after: 40 }),
        ...(note ? [para([run(note, 15, noteColor || SUBTXT)], { after: 0 })] : []),
      ],
      { w, bg: ALT_ROW, borders: { ...b, top: { style: BorderStyle.SINGLE, size: 12, color: NAVY } }, margins: { top: 120, bottom: 120, left: 160, right: 160 } }
    )
  }

  return tbl(
    [tblRow([
      box('Total Project Cost Range', `${f1k(cost?.total?.low)} – ${f1k(cost?.total?.high)}`, `Excl. VAT  |  ${f1k(cost?.vat)} VAT at 20% (ref)`),
      box('Programme', `${programme?.totalWeeks} weeks`, targetNote, targetColor),
      box('BCIS Region', cost?.bcisRegion || '', `Location factor: ${cost?.bcisFactor}`, undefined, bw3),
    ])],
    [bw, bw, bw3]
  )
}

// ─── Cover page ───────────────────────────────────────────────────────────────
function buildCover(projName, dateStr, cost, programme, aiProse) {
  const confLabel = aiProse?.confidenceLabel || 'Moderate Confidence'
  const grade     = aiProse?.confidenceScore  || 'B'
  const riskLevel = cost?.percentages?.riskLevel || 'Medium'

  const coverPad = { top: 120, bottom: 120, left: 480, right: 480 }

  function coverCell(children) {
    return cell(children, { w: W, bg: NAVY, borders: NO_B, margins: coverPad })
  }

  return [
    tbl([
      // Subtitle row
      tblRow([coverCell(
        para([run('RIBA STAGE 0–1 FEASIBILITY REPORT', 18, AMBER_LT, true)],
          { before: 480, after: 120 })
      )]),
      // Project name row — large display heading
      tblRow([coverCell(
        para([headRun(projName, 64, WHITE)], { before: 0, after: 360 })
      )]),
      // Metadata row
      tblRow([coverCell(
        para([
          run('Date: ', 15, MID_GR),
          run(dateStr, 18, WHITE),
          run('     ', 18, WHITE),
          run('Confidence: ', 15, MID_GR),
          run(`Grade ${grade} — ${confLabel}`, 18, WHITE),
          run('     ', 18, WHITE),
          run('Cost Risk: ', 15, MID_GR),
          run(riskLevel, 18, WHITE),
        ], { after: 120 })
      )]),
      // Cost range row
      tblRow([coverCell(
        para([
          run('Total Project Cost: ', 15, MID_GR),
          run(`${f1k(cost?.total?.low)} – ${f1k(cost?.total?.high)} (excl. VAT)`, 18, WHITE, true),
          run('     |     ', 18, MID_GR),
          run('Programme: ', 15, MID_GR),
          run(`${programme?.totalWeeks || '—'} weeks`, 18, WHITE, true),
        ], { after: 720 })
      )]),
      // Amber accent band at the foot of the cover
      tblRow([cell(
        para([run('', 8)], { after: 0 }),
        { w: W, bg: AMBER, borders: NO_B, margins: { top: 30, bottom: 30, left: 0, right: 0 } }
      )]),
    ], [W]),
    para([new PageBreak()]),
  ]
}

// ─── GROUP names ─────────────────────────────────────────────────────────────
const GROUP_NAMES = {
  0: 'GROUP 0 — FACILITATING WORKS',
  1: 'GROUP 1 — SUBSTRUCTURE',
  2: 'GROUP 2 — SUPERSTRUCTURE',
  3: 'GROUP 3 — INTERNAL FINISHES',
  4: 'GROUP 4 — FITTINGS, FURNISHINGS & EQUIPMENT',
  5: 'GROUP 5 — MECHANICAL & ELECTRICAL SERVICES',
  6: 'GROUP 6 — PREFABRICATED / MODULAR',
  7: 'GROUP 7 — WORK TO EXISTING BUILDINGS',
  8: 'GROUP 8 — EXTERNAL WORKS',
  99: 'PROVISIONAL SUMS & SPECIALIST SCOPE',
}

// ─── Works cost table ─────────────────────────────────────────────────────────
// Columns: Code | Element | Low £/m² | High £/m² | Total Low £ | Total High £
function worksTable(lineItems) {
  if (!lineItems || lineItems.length === 0) return []
  const COLS = [700, 3026, 1075, 1075, 1075, 1075]

  // Header row
  const hdrs = ['Code', 'Element', 'Rate Low', 'Rate High', 'Total Low £', 'Total High £']
  const headerRow = tblRow(hdrs.map((h, i) => hdrCell(h, COLS[i], {
    align: i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT
  })))

  const rows = [headerRow]
  let lastGroup = null
  let ri = 0

  // Group name row
  function groupRow(groupNum) {
    return tblRow([
      cell(
        para([run(GROUP_NAMES[groupNum] || `GROUP ${groupNum}`, 17, WHITE, true)]),
        { w: W, bg: '2E4A6E', borders: NO_B, span: 6 }
      ),
    ])
  }

  // Data row
  function dataRow(item, idx) {
    // Use the calculator's own low/high rates rather than re-deriving the spread,
    // so this column can never drift from the priced figures.
    const lowRate  = Math.round(item.rateLow  ?? (item.rate || 0) * 0.89)
    const highRate = Math.round(item.rateHigh ?? (item.rate || 0) * 1.11)
    const bg = altRow(idx)
    const brd = thinB(BORDER)
    return tblRow([
      cell(para([run(item.code || '', 18, MID_GR)]),            { w: COLS[0], bg, borders: brd }),
      cell(para([run(item.description || '', 18, TXT)]),         { w: COLS[1], bg, borders: brd }),
      cell(para([run(f(lowRate), 18, TXT)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[2], bg, borders: brd }),
      cell(para([run(f(highRate), 18, TXT)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[3], bg, borders: brd }),
      cell(para([run(f100(item.lineLow || 0), 18, TXT)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[4], bg, borders: brd }),
      cell(para([run(f100(item.lineHigh || 0), 18, TXT)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[5], bg, borders: brd }),
    ])
  }

  for (const item of lineItems) {
    if (item.group !== lastGroup) {
      rows.push(groupRow(item.group))
      lastGroup = item.group
      ri = 0
    }
    rows.push(dataRow(item, ri++))
  }

  // Totals row
  const totalLow  = lineItems.reduce((s, i) => s + (i.lineLow  || 0), 0)
  const totalHigh = lineItems.reduce((s, i) => s + (i.lineHigh || 0), 0)
  rows.push(tblRow([
    cell(para([run('WORKS COST TOTAL', 18, WHITE, true)], { after: 0 }), { w: COLS[0] + COLS[1] + COLS[2] + COLS[3], bg: NAVY, borders: NO_B, span: 4 }),
    cell(para([run(f1k(totalLow), 18, WHITE, true)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[4], bg: NAVY, borders: NO_B }),
    cell(para([run(f1k(totalHigh), 18, WHITE, true)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[5], bg: NAVY, borders: NO_B }),
  ]))

  return [new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS, borders: NO_B, rows })]
}

// ─── Construction cost table (Low / High columns) ─────────────────────────────
// Columns: Item | Rate | Low £ | High £
function constructionTable(cost) {
  const COLS = [5026, 1500, 1250, 1250]
  const p = cost.percentages
  const wL = cost.works.low, wH = cost.works.high
  const cL = cost.construction.low, cH = cost.construction.high

  const hdrs = ['Item', 'Rate', 'Low £', 'High £']
  const headerRow = tblRow(hdrs.map((h, i) =>
    hdrCell(h, COLS[i], { align: i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT })
  ))

  function dataR(item, rate, low, high, idx, isTotal = false) {
    const bg  = isTotal ? NAVY : altRow(idx)
    const col = isTotal ? WHITE : TXT
    const brd = isTotal ? NO_B : thinB(BORDER)
    return tblRow([
      cell(para([run(item, 18, col, isTotal)], { after: 0 }), { w: COLS[0], bg, borders: brd }),
      cell(para([run(rate, 18, isTotal ? WHITE : SUBTXT)], { after: 0 }), { w: COLS[1], bg, borders: brd }),
      cell(para([run(f1k(low), 18, col, isTotal)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[2], bg, borders: brd }),
      cell(para([run(f1k(high), 18, col, isTotal)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[3], bg, borders: brd }),
    ])
  }

  const rows = [
    headerRow,
    dataR('Works Cost', '', wL, wH, 0),
    dataR(`Contractor’s Preliminaries (A)`, `${pct(p.prelims)} of Works`, wL * p.prelims / 100, wH * p.prelims / 100, 1),
    dataR('Overheads & Profit (B)', `${pct(p.ohp)} of Works`, wL * p.ohp / 100, wH * p.ohp / 100, 2),
    dataR('CONSTRUCTION COST TOTAL', '', cL, cH, 3, true),
  ]

  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS, borders: NO_B, rows })
}

// ─── Total project cost table (Low / High columns) ───────────────────────────
function totalCostTable(cost) {
  const COLS = [5026, 1500, 1250, 1250]
  const p = cost.percentages
  const wL = cost.works.low, wH = cost.works.high
  const cL = cost.construction.low, cH = cost.construction.high
  const tL = cost.total.low, tH = cost.total.high

  const hdrs = ['Item', 'Rate', 'Low £', 'High £']
  const headerRow = tblRow(hdrs.map((h, i) =>
    hdrCell(h, COLS[i], { align: i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT })
  ))

  function dataR(item, rate, low, high, idx, isTotal = false, isVat = false) {
    const bg  = isTotal ? NAVY  : altRow(idx)
    const col = isTotal ? WHITE : TXT
    const brd = isTotal ? NO_B  : thinB(BORDER)
    const it  = isVat && !isTotal
    return tblRow([
      cell(para([run(item, 18, col, isTotal, it)], { after: 0 }), { w: COLS[0], bg, borders: brd }),
      cell(para([run(rate, 18, isTotal ? WHITE : SUBTXT, false, it)], { after: 0 }), { w: COLS[1], bg, borders: brd }),
      cell(para([run(f1k(low), 18, col, isTotal, it)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[2], bg, borders: brd }),
      cell(para([run(f1k(high), 18, col, isTotal, it)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[3], bg, borders: brd }),
    ])
  }

  const rows = [headerRow]
  let ri = 0
  rows.push(dataR('Construction Cost', '', cL, cH, ri++))
  rows.push(dataR('Professional Fees (C)', `${pct(p.fees)} of Construction`, cL * p.fees / 100, cH * p.fees / 100, ri++))
  if ((cost.breakdown?.devCosts || 0) > 0)
    rows.push(dataR('Developer & Project Costs (D)', `${pct(p.devCosts)} of Construction`, cL * p.devCosts / 100, cH * p.devCosts / 100, ri++))
  rows.push(dataR('Risk Allowance (E)', `${pct(p.risk)} of Works`, wL * p.risk / 100, wH * p.risk / 100, ri++))
  rows.push(dataR('Client Contingency (H)', `${pct(p.contingency)} of Works`, wL * p.contingency / 100, wH * p.contingency / 100, ri++))
  // Inflation is negligible on short programmes — only show the row when it rounds to a non-zero figure.
  if (Math.round((wH * p.inflation / 100) / 1000) > 0 || Math.round((wL * p.inflation / 100) / 1000) > 0)
    rows.push(dataR('Inflation Allowance (F)', `${pct(p.inflation)} of Works`, wL * p.inflation / 100, wH * p.inflation / 100, ri++))
  rows.push(dataR('TOTAL PROJECT COST (excl. VAT)', '', tL, tH, ri++, true))
  rows.push(dataR('VAT @ 20% (reference — recoverability to be confirmed)', '20%', tL * 0.20, tH * 0.20, ri++, false, true))

  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS, borders: NO_B, rows })
}

// ─── Programme table ──────────────────────────────────────────────────────────
function programmeTable(stages, totalWeeks) {
  if (!stages || stages.length === 0) return null
  const COLS = [1800, 5826, 1400]
  const hdrs = ['Stage', 'Activity', 'Weeks']
  const headerRow = tblRow(hdrs.map((h, i) =>
    hdrCell(h, COLS[i], { align: i === 2 ? AlignmentType.RIGHT : AlignmentType.LEFT })
  ))

  const rows = [headerRow]
  stages.forEach((s, i) => {
    const wks     = s.weeks ?? s.durationWks ?? 0
    // Parallel rows (surveys, planning, BC) run concurrently and are NOT added to
    // the TOTAL — shown in parentheses with a ∥ marker so the column reconciles.
    const wkText  = s.parallel ? `(${wks}) ∥` : String(wks)
    const wkColor = s.parallel ? SUBTXT : TXT
    rows.push(tblRow([
      cell(para([run(s.stage || '', 18, NAVY, true)], { after: 0 }), { w: COLS[0], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(s.activity || '', 18, TXT)], { after: 0 }), { w: COLS[1], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(wkText, 18, wkColor)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[2], bg: altRow(i), borders: thinB(BORDER) }),
    ]))
  })
  rows.push(tblRow([
    cell(para([run('TOTAL', 18, WHITE, true)], { after: 0 }), { w: COLS[0] + COLS[1], bg: NAVY, borders: NO_B, span: 2 }),
    cell(para([run(String(totalWeeks), 18, WHITE, true)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[2], bg: NAVY, borders: NO_B }),
  ]))

  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS, borders: NO_B, rows })
}

// ─── Programme Gantt bar (Word) ───────────────────────────────────────────────
function ganttTable(stages, totalWeeks, surveyWeeks) {
  if (!stages || stages.length === 0 || !totalWeeks) return null
  // Exclude every parallel activity (surveys, planning, building control) from the
  // sequential bar — they run concurrently and are already excluded from the
  // total, so stacking them here would overflow the bar past totalWeeks. The
  // sequential "— wait" overrun rows are NOT parallel and remain.
  const mainStages = stages.filter(s => !s.parallel)
  if (!mainStages.length) return null

  // 1-week cols for ≤40 weeks, 2-week cols for >40
  const scale    = totalWeeks > 40 ? 2 : 1
  const numCols  = Math.min(Math.ceil(totalWeeks / scale), 40)

  const labelW   = 1500
  const totalWkW = W - labelW
  const wkW      = Math.floor(totalWkW / numCols)
  const lastWkW  = totalWkW - wkW * (numCols - 1)
  const COLS_arr = [labelW, ...Array(numCols - 1).fill(wkW), lastWkW]

  const GANTT_COLORS = [
    { test: s => /tender|procurement/i.test(s), color: '5B7BA6' },
    { test: s => /construction|phase/i.test(s), color: '1A2E4A' },
    { test: s => /handover/i.test(s),           color: '4A5568' },
    { test: s => /governance/i.test(s),         color: '7B5113' },
    { test: () => true,                         color: '3E5C84' },
  ]
  const getColor = name => (GANTT_COLORS.find(m => m.test(name || '')) || GANTT_COLORS[4]).color

  function ganttRow(labelText, labelColor, startColIdx, endColIdx, barColor) {
    const cells = [
      cell(para([run(labelText, 14, labelColor || TXT)], { after: 0 }), { w: labelW, bg: WHITE, borders: thinB(BORDER) })
    ]
    for (let c = 1; c <= numCols; c++) {
      const filled = c >= startColIdx && c <= endColIdx
      const cw = c === numCols ? lastWkW : wkW
      cells.push(cell(para([run('', 10)], { after: 0 }), { w: cw, bg: filled ? barColor : WHITE, borders: thinB('DDDDDD') }))
    }
    return tblRow(cells)
  }

  // Header row: label + week numbers
  const hdrCells = [hdrCell(`Phase (${scale === 2 ? '2-week cols' : 'weeks'})`, labelW)]
  for (let c = 1; c <= numCols; c++) {
    const cw = c === numCols ? lastWkW : wkW
    hdrCells.push(cell(para([run(String((c - 1) * scale + 1), 12, WHITE)], { align: AlignmentType.CENTER, after: 0 }), { w: cw, bg: NAVY, borders: NO_B }))
  }

  const rows = [tblRow(hdrCells)]

  // Surveys parallel track
  const sw = surveyWeeks || 0
  if (sw > 0) {
    const surveyEnd = Math.min(Math.ceil(sw / scale), numCols)
    rows.push(ganttRow('Surveys (concurrent with design)', '166534', 1, surveyEnd, '70AD47'))
  }

  // Main stages stacked linearly
  let cumWks = 0
  for (const s of mainStages) {
    const wks = s.weeks ?? s.durationWks ?? 0
    if (!wks) continue
    const startCol = Math.floor(cumWks / scale) + 1
    const endCol   = Math.min(Math.ceil((cumWks + wks) / scale), numCols)
    rows.push(ganttRow(s.stage || '', TXT, startCol, endCol, getColor(s.stage)))
    cumWks += wks
  }

  return [
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS_arr, borders: NO_B, rows }),
    para([run('Gantt shows indicative durations. Surveys run concurrently with early design stages.', 15, GRAY, false, true)], { after: 60 }),
  ]
}

// ─── Risk register table ──────────────────────────────────────────────────────
function riskTable(risks) {
  if (!risks || risks.length === 0) return null
  // 5-column layout: Ref / Category / Description / Rating / Mitigation
  const COLS = [500, 1300, 3300, 1200, 2726]
  const hdrs = ['Ref', 'Category', 'Description', 'Rating', 'Mitigation']
  const headerRow = tblRow(hdrs.map((h, i) =>
    hdrCell(h, COLS[i], { align: AlignmentType.LEFT })
  ))

  const RAG_BG  = { High: 'FEE2E2', Medium: 'FEF9C3', Low: 'DCFCE7' }
  const RAG_COL = { High: 'C0392B', Medium: '92400E', Low: '166534' }
  const RAG_SOL = { High: 'C0392B', Medium: 'D97706', Low: '70AD47' }

  function ragCell(val, cw) {
    const bg  = RAG_SOL[val] || ALT_ROW
    return cell(
      para([run(val || '', 16, WHITE, true)], { align: AlignmentType.CENTER, after: 0 }),
      { w: cw, bg, borders: thinB(BORDER) }
    )
  }

  const rows = [headerRow]
  risks.forEach((r, i) => {
    rows.push(tblRow([
      cell(para([run(r.ref || `R${String(i+1).padStart(2,'0')}`, 16, NAVY, true)], { after: 0 }), { w: COLS[0], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(r.category || '', 16, TXT)], { after: 0 }), { w: COLS[1], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(r.description || '', 16, TXT)], { after: 0 }), { w: COLS[2], bg: altRow(i), borders: thinB(BORDER) }),
      ragCell(r.rating, COLS[3]),
      cell(para([run(r.mitigation || '', 16, TXT)], { after: 0 }), { w: COLS[4], bg: altRow(i), borders: thinB(BORDER) }),
    ]))
  })

  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS, borders: NO_B, rows })
}

// ─── Constraints table ────────────────────────────────────────────────────────
function constraintsTable(constraints) {
  if (!constraints || constraints.length === 0) return null
  const COLS = [1200, 2226, 5600]
  const hdrs = ['Category', 'Constraint', 'Impact']
  const headerRow = tblRow(hdrs.map((h, i) => hdrCell(h, COLS[i])))

  const rows = [headerRow]
  constraints.forEach((c, i) => {
    rows.push(tblRow([
      cell(para([run(c.category || '', 18, NAVY, true)], { after: 0 }), { w: COLS[0], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(c.title || '', 18, TXT, true)], { after: 0 }), { w: COLS[1], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(c.text || '', 18, TXT)], { after: 0 }), { w: COLS[2], bg: altRow(i), borders: thinB(BORDER) }),
    ]))
  })

  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS, borders: NO_B, rows })
}

// ─── Scope text ───────────────────────────────────────────────────────────────
function scopeParas(lineItems) {
  if (!lineItems || lineItems.length === 0)
    return [para([run('To be confirmed following completion of surveys and Stage 2 design.', 20, SUBTXT, false, true)])]

  const groups = {}
  for (const item of lineItems) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item.description)
  }
  const result = []
  for (const [grp, items] of Object.entries(groups)) {
    result.push(para([run(GROUP_NAMES[Number(grp)] || `Group ${grp}`, 18, NAVY, true)], { before: 80, after: 20 }))
    for (const desc of items) result.push(bul(desc))
  }
  return result
}

// ─── Estimate basis text ──────────────────────────────────────────────────────
// Deterministic statement of what the estimate is based on — stage tolerance,
// data vintage (workbook versions), location adjustment, inflation basis.
// First thing a reviewing QS looks for.
function estimateBasisParas(cost, programme, dateStr) {
  const sources = [cost.workbookVersion, programme?.workbookVersion].filter(Boolean).join(' and ')
  const items = [
    `This is an NRM1 order of cost estimate prepared at RIBA Stage 0–1 from benchmark rates, not measured quantities. At this stage outturn costs typically vary by ±20–25% as the design develops; the range shown reflects benchmark rate uncertainty only.`,
    `Data sources: ${sources || 'Estates AI rates and programme workbooks'}. Report generated ${dateStr}; rates are current at the workbook issue date.`,
    `Location adjustment: BCIS factor ${cost.bcisFactor} (${cost.bcisRegion})${cost.bcisDefaulted ? ' — applied as a default because the postcode matched no BCIS region; verify the postcode before relying on location-adjusted rates' : ''}.`,
    `Inflation allowance (F) at ${cost.percentages?.inflation}% covers forecast tender and construction inflation over the ${programme?.totalWeeks ?? '—'}-week programme, measured from the estimate base date (the date of generation).`,
  ]
  return items.map(t => bul(t))
}

// Scope items the user selected that carry no quantity (and therefore no
// price), plus any un-priced specialist scope note — listed so nothing the
// client asked for silently vanishes from the estimate.
function notCostedParas(cost) {
  const items = [
    ...(cost.excludedNoQuantity || []).map(e =>
      `${e.description} — selected in scope but excluded from the estimate pending a confirmed quantity.`),
    ...(cost.additionalScopeNote ? [cost.additionalScopeNote] : []),
  ]
  return items.map(t => bul(t))
}

// ─── Cost assumptions text ────────────────────────────────────────────────────
function costAssumptionParas(cost, answers) {
  const items = [
    `All rates are at Q2 2026 national mean (BCIS/RICS). BCIS location factor ${cost.bcisFactor} applied for ${cost.bcisRegion}.`,
    `GIFA of ${cost.gifa} m² used as the pricing quantity. Rates are £/m² unless stated.`,
    `Band position factor of ${cost.bandFactor} applied (${cost.interventionLevel}).`,
    `Professional fees at ${cost.percentages?.fees}% reflect the project being at RIBA Stage ${answers?.q4_5_designStage || '0–1'}.`,
    `Contingency fixed at 5% (RIBA Stage 0–1 standard). Survey uncertainty is captured in Risk Allowance (E).`,
    `VAT at 20% is shown for reference only. Recoverability to be confirmed by the client’s Finance team.`,
    `This estimate has not been prepared from measured quantities. A formal cost plan by a Chartered Quantity Surveyor is required before any financial commitment.`,
  ]
  return items.map(t => bul(t))
}

const COST_EXCLUSIONS = [
  'VAT (unless stated above)',
  'Loose furniture, fittings and equipment (FF&E)',
  'IT and AV equipment (unless explicitly included in scope)',
  'Land acquisition, legal fees, and stamp duty',
  'Party wall awards and neighbourly matters',
  'Archaeological investigation',
  'Asbestos removal beyond the survey allowance in Risk Allowance (E)',
  'Costs arising from unforeseen ground conditions beyond the risk allowance',
]

// Groundworks-related caveats only apply where there is facilitating, substructure
// or external-works scope — drop them for pure internal refurbishments.
function costExclusions(cost) {
  const groups = new Set((cost?.lineItems || []).map(i => i.group))
  const hasGroundworks = groups.has(0) || groups.has(1) || groups.has(8)
  return COST_EXCLUSIONS.filter(e =>
    hasGroundworks || !/archaeolog|ground conditions/i.test(e))
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function buildReport({ answers, cost, programme, aiProse, budget }) {
  const projName  = answers.q1_0_projectName || 'Estates Project'
  const dateStr   = fmt()
  const roi       = calcRoi(answers, cost)

  // ── Optional section flags ─────────────────────────────────────────────────
  // If the user ticked nothing in Q6.1, include all optional sections (default).
  const optSections = Array.isArray(answers.q6_1_sections || answers.q6_1_reportSections) && (answers.q6_1_sections || answers.q6_1_reportSections).length > 0
    ? (answers.q6_1_sections || answers.q6_1_reportSections)
    : ['Order of Cost Estimate (NRM1)', 'ROI & Financial Case', 'Procurement Recommendation', 'Constraints Summary']
  const showCost = optSections.includes('Order of Cost Estimate (NRM1)')
  const showROI  = !!roi && optSections.includes('ROI & Financial Case')
  const showProc = optSections.includes('Procurement Recommendation')
  const showCon  = optSections.includes('Constraints Summary')

  // Dynamic section numbering — sections 1–4 always present; 5–8 depend on flags
  let _sn = 4
  const snCost = showCost ? String(++_sn) : null
  const snROI  = showROI  ? String(++_sn) : null
  const snProc = showProc ? String(++_sn) : null
  const snCon  = showCon  ? String(++_sn) : null
  const snNext = String(++_sn)

  const content = [
    // ── Cover ──
    ...buildCover(projName, dateStr, cost, programme, aiProse),

    // ── Info boxes ──
    infoBoxes(cost, programme),
    empty(),

    // ── Section 1 — Executive Summary ──
    ...sectionHdr('1', 'Executive Summary'),
    para([run(aiProse?.executiveSummary || '', 20, TXT)], { after: 80 }),
    ...(aiProse?.keyFindings?.length > 0 ? [
      subHdr('Key Findings'),
      ...aiProse.keyFindings.map(kf => num2(kf)),
    ] : []),

    // ── Section 2 — Scope of Works ──
    ...sectionHdr('2', 'Scope of Works'),
    subHdr('Included Works'),
    ...scopeParas(cost.lineItems),
    subHdr('Exclusions'),
    para([run('Loose furniture and fittings; IT and AV equipment (unless explicitly scoped); land acquisition, legal fees and stamp duty; VAT; asbestos removal beyond the risk allowance; party wall awards; unforeseen ground conditions.', 20, TXT)]),
    subHdr('Scope Assumptions'),
    ...(aiProse?.scopeAssumptions?.length > 0
      ? aiProse.scopeAssumptions.map(a => bul(a))
      : [para([run('Scope to be confirmed following completion of surveys and Stage 2 design.', 20, SUBTXT, false, true)])]),

    // ── Section 3 — Risk Register ──
    para([new PageBreak()]),
    ...sectionHdr('3', 'Risk Register'),
    ...(aiProse?.riskRegister?.length > 0
      ? [riskTable(aiProse.riskRegister)]
      : [para([run('No risk register data available.', 20, SUBTXT)])]),
    empty(),

    // ── Section 4 — High-Level Programme ──
    para([new PageBreak()]),
    ...sectionHdr('4', 'High-Level Programme'),
    para([
      run('Total programme: ', 20, NAVY, true),
      run(`${programme?.totalWeeks} weeks`, 20, TXT),
      run('     |     ', 20, SUBTXT),
      run('Procurement route: ', 20, NAVY, true),
      run(programme?.procurementRoute || '—', 20, TXT),
    ], { after: 80 }),
    ...(programme?.targetNote ? [
      para([run(programme.targetNote, 20, programme.targetStatus === 'at-risk' ? 'C0392B' : '2A7A4B', true)], { after: 100 }),
    ] : []),
    ...(programme?.stages?.length > 0 ? [
      programmeTable(programme.stages, programme.totalWeeks),
      ...(programme.stages.some(s => s.parallel)
        ? [para([run('∥ Parallel activity — runs concurrently with the design stages and is excluded from the programme total.', 16, SUBTXT, false, true)], { after: 60 })]
        : []),
      empty(),
      ...(ganttTable(programme.stages, programme.totalWeeks, programme.surveyWeeks) || []),
    ] : []),
    ...(programme?.milestones?.length > 0 ? [
      subHdr('Key Milestones'),
      ...programme.milestones.map(m => bul(m)),
    ] : []),
    ...(( programme?.assumptions || programme?.standardAssumptions)?.length > 0 ? [
      subHdr('Programme Assumptions'),
      ...(programme.assumptions || programme.standardAssumptions).map(a => bul(a)),
    ] : []),

    // ── Section 5 — Cost Estimate (optional) ──
    ...(showCost ? [
    para([new PageBreak()]),
    ...sectionHdr(snCost, 'Order of Cost Estimate (NRM1)'),
    para([
      run('GIFA: ', 20, NAVY, true), run(`${cost.gifa} m²`, 20, TXT),
      run('   |   ', 20, SUBTXT),
      run('Region: ', 20, NAVY, true), run(cost.bcisRegion, 20, TXT),
      run('   |   ', 20, SUBTXT),
      run('BCIS Factor: ', 20, NAVY, true), run(String(cost.bcisFactor), 20, TXT),
      run('   |   ', 20, SUBTXT),
      run('Specification: ', 20, NAVY, true), run(cost.specLevel, 20, TXT),
    ], { after: 80 }),
    ...(aiProse?.costNarrative ? [
      para([run(aiProse.costNarrative, 20, TXT)], { after: 120 }),
    ] : []),

    subHdr('Estimate Basis'),
    ...estimateBasisParas(cost, programme, dateStr),

    subHdr('Section 1 — Works Cost'),
    ...worksTable(cost.lineItems),
    empty(),

    subHdr('Section 2 — Construction Cost'),
    constructionTable(cost),
    empty(),

    subHdr('Section 3 — Total Project Cost'),
    totalCostTable(cost),
    empty(),

    para([
      run('Total Cost Range: ', 20, NAVY, true),
      run(`${f1k(cost.total.low)} – ${f1k(cost.total.high)} (excl. VAT)`, 20, TXT),
      run('   |   ', 20, SUBTXT),
      run('Cost Risk: ', 20, NAVY, true),
      run(cost.percentages.riskLevel, 20, TXT),
    ], { after: 80 }),

    ...(budget && budget.status !== 'none' ? [
      para([
        run('Budget Check: ', 20, NAVY, true),
        run(budget.note, 20, budget.status === 'insufficient' ? 'C0392B' : (budget.status === 'tight' ? '92400E' : '2A7A4B')),
      ], { after: 80 }),
    ] : []),

    subHdr('Cost Assumptions'),
    ...costAssumptionParas(cost, answers),

    subHdr('Cost Exclusions'),
    ...costExclusions(cost).map(e => bul(e)),
    ...((cost.excludedNoQuantity?.length || cost.additionalScopeNote) ? [
      subHdr('Selected Items Not Costed'),
      ...notCostedParas(cost),
    ] : []),
    ] : []),   // end showCost

    // ── Section 6 — ROI (optional + data-conditional) ──
    ...(showROI ? [
      ...sectionHdr(snROI, 'ROI & Financial Case'),
      para([
        run('Benefit type: ', 20, NAVY, true),
        run(Array.isArray(answers.q5_1_financialBenefit) ? answers.q5_1_financialBenefit.join(' | ') : (answers.q5_1_financialBenefit || '—'), 20, TXT),
        run('   |   ', 20, SUBTXT),
        run('Annual benefit: ', 20, NAVY, true),
        run(f(roi.annual) + ' per annum', 20, TXT),
        run('   |   ', 20, SUBTXT),
        run('Project cost (mid): ', 20, NAVY, true),
        run(f1k(roi.mid), 20, TXT),
        run('   |   ', 20, SUBTXT),
        run('Simple payback: ', 20, NAVY, true),
        run(`${roi.paybackYears} years`, 20, TXT),
      ], { after: 80 }),
      ...(aiProse?.roiNarrative ? [para([run(aiProse.roiNarrative, 20, TXT)])] : []),
    ] : []),

    // ── Section 7 — Procurement (optional) ──
    ...(showProc ? [
      ...sectionHdr(snProc, 'Procurement Recommendation'),
      para([
        run('Route: ', 20, NAVY, true),
        run(aiProse?.procurementRoute || '', 20, TXT),
        run('   |   ', 20, SUBTXT),
        run('Contract: ', 20, NAVY, true),
        run(aiProse?.procurementContractForm || '', 20, TXT),
      ], { after: 60 }),
      para([
        run('Design responsibility: ', 20, NAVY, true),
        run(aiProse?.procurementDesignResp || '', 20, TXT),
        run('   |   ', 20, SUBTXT),
        run('Tender type: ', 20, NAVY, true),
        run(aiProse?.procurementTenderType || '', 20, TXT),
      ], { after: 100 }),
      ...(aiProse?.procurementNarrative ? [para([run(aiProse.procurementNarrative, 20, TXT)])] : []),
      ...(aiProse?.procurementConsiderations?.length > 0 ? [
        subHdr('Commercial Considerations'),
        ...aiProse.procurementConsiderations.map(c => bul(c)),
      ] : []),
      ...(aiProse?.procurementConflicts?.length > 0
        ? [para([run('⚠ ' + aiProse.procurementConflicts.join('  |  '), 20, 'C0392B')])]
        : [para([run('No procurement conflicts identified.', 20, SUBTXT, false, true)])]),
    ] : []),

    // ── Section 8 — Constraints (optional + data-conditional) ──
    ...(showCon && aiProse?.constraints?.length > 0 ? [
      ...sectionHdr(snCon, 'Constraints Summary'),
      constraintsTable(aiProse.constraints),
      empty(),
    ] : []),

    // ── Section 9 — Next Steps ──
    ...sectionHdr(snNext, 'Recommendations & Next Steps'),
    ...(aiProse?.nextSteps?.length > 0
      ? aiProse.nextSteps.map(s => num2(s))
      : [para([run('Commission outstanding surveys and appoint design team to proceed to RIBA Stage 2.', 20, SUBTXT)])]),

    // ── Disclaimer ──
    empty(),
    para([run('', 20)], { before: 240, after: 0 }),
    para([run('Disclaimer', 20, NAVY, true)], { after: 60 }),
    para([run(
      'This report has been produced at RIBA Stage 0–1 using benchmark cost and programme data from published industry sources (BCIS, RICS). All figures are indicative and subject to change following completion of surveys, design development, and competitive procurement. This report does not constitute a formal cost plan and should not be used as the basis for a financial commitment without review by a Chartered Quantity Surveyor. Programme durations are indicative and assume standard productivity and client decision-making within the gateway periods shown.',
      18, SUBTXT, false, true
    )], { after: 60 }),
    para([run(
      'Use of this tool is subject to our Terms of Use and Privacy Notice. Report generated by Estates AI — an indicative planning tool, not a substitute for professional advice.',
      16, GRAY
    )], { after: 0 }),
  ]

  // Strip any null/undefined entries that table functions may return when data is absent
  const safeContent = content.filter(Boolean)

  const doc = new Document({
    features: { updateFields: true },
    numbering: { config: NUM_CFG },
    sections: [{
      properties: {
        page: {
          size:   { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
        titlePage: true,
      },
      headers: {
        default: buildHeader(projName),
        first:   new Header({ children: [empty()] }),
      },
      footers: {
        default: buildFooter(),
        first:   new Footer({ children: [empty()] }),
      },
      children: safeContent,
    }],
  })

  let buffer
  try {
    buffer = await Packer.toBuffer(doc)
  } catch (docxErr) {
    console.error('[reportBuilder] Packer.toBuffer failed:', docxErr)
    throw docxErr
  }
  return buffer
}

// ─── Template health-check (kept for API compatibility) ───────────────────────
export async function getTemplateInfo() {
  return { templateOk: true, templateTags: 0, missingTags: [], note: 'Using docx-js builder (no template file required)' }
}
