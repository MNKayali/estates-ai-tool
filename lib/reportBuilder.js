/**
 * reportBuilder.js — Builds a Word document (.docx) matching the production template.
 *
 * Design spec (from Estates_AI_Report_Template_PRODUCTION.docx):
 *   Primary navy:   #1A2E4A   Light navy: #9FB3CC   Label gray: #9AA3AD
 *   Mid gray:       #7E93AD   Alt row bg: #F0F2F4   Border:     #CCCCCC
 *   Font: Arial throughout   Page: A4 (11906 × 16838 DXA)   Margins: 1440 DXA
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
const NAVY_LT = '9FB3CC'
const GRAY    = '9AA3AD'
const MID_GR  = '7E93AD'
const ALT_ROW = 'F0F2F4'
const BORDER  = 'CCCCCC'
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
  const mid    = cost?.total?.mid
  if (!annual || !mid) return null
  return { annual, mid, paybackYears: Math.round((mid / annual) * 10) / 10 }
}

// ─── Border helpers ───────────────────────────────────────────────────────────
const NONE = { style: BorderStyle.NONE, size: 0, color: WHITE }
const NO_B = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideH: NONE, insideV: NONE }

function thinB(c = BORDER) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: c }
  return { top: b, bottom: b, left: b, right: b }
}

function btmB(c = NAVY, sz = 18) {
  return { top: NONE, bottom: { style: BorderStyle.SINGLE, size: sz, color: c }, left: NONE, right: NONE }
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
function sectionHdr(number, title) {
  const numW  = 700
  const txtW  = W - numW  // 8326
  return [
    para([run('', 20)], { before: 240, after: 0 }),
    tbl(
      [tblRow([
        cell(
          para([run(number, 24, WHITE, true)], { align: AlignmentType.CENTER, after: 0 }),
          { w: numW, bg: NAVY, borders: NO_B, valign: VerticalAlign.CENTER }
        ),
        cell(
          para([run(title, 24, NAVY, true)], { align: AlignmentType.LEFT, after: 0 }),
          {
            w: txtW,
            borders: btmB(NAVY, 18),
            margins: { top: 80, bottom: 80, left: 160, right: 120 },
            valign: VerticalAlign.CENTER,
          }
        ),
      ])],
      [numW, txtW]
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

  function box(label, value, note, noteColor) {
    return cell(
      [
        para([run(label, 15, GRAY, true)], { after: 40 }),
        para([run(value, 22, NAVY, true)], { after: 40 }),
        ...(note ? [para([run(note, 15, noteColor || SUBTXT)], { after: 0 })] : []),
      ],
      { w: bw, bg: ALT_ROW, borders: thinB(BORDER), margins: { top: 120, bottom: 120, left: 160, right: 160 } }
    )
  }

  return tbl(
    [tblRow([
      box('Total Project Cost Range', `${f1k(cost?.total?.low)} – ${f1k(cost?.total?.high)}`, `Excl. VAT  |  ${f1k(cost?.vat)} VAT at 20% (ref)`),
      box('Programme', `${programme?.totalWeeks} weeks`, targetNote, targetColor),
      { ...box('BCIS Region', cost?.bcisRegion || '', `Location factor: ${cost?.bcisFactor}`), width: { size: bw3, type: WidthType.DXA } },
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
        para([run('RIBA STAGE 0–1 FEASIBILITY REPORT', 18, NAVY_LT, true)],
          { before: 480, after: 120 })
      )]),
      // Project name row
      tblRow([coverCell(
        para([run(projName, 56, WHITE, true)], { before: 0, after: 360 })
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
        { w: W, bg: NAVY, borders: NO_B, span: 6 }
      ),
    ])
  }

  // Data row
  function dataRow(item, idx) {
    const lowRate  = Math.round((item.rate || 0) * 0.89)
    const highRate = Math.round((item.rate || 0) * 1.11)
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
  rows.push(dataR('Client Contingency (H)', '5% of Works', wL * 0.05, wH * 0.05, ri++))
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
    rows.push(tblRow([
      cell(para([run(s.stage || '', 18, NAVY, true)], { after: 0 }), { w: COLS[0], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(s.activity || '', 18, TXT)], { after: 0 }), { w: COLS[1], bg: altRow(i), borders: thinB(BORDER) }),
      cell(para([run(String(s.weeks ?? s.durationWks ?? 0), 18, TXT)], { align: AlignmentType.RIGHT, after: 0 }), { w: COLS[2], bg: altRow(i), borders: thinB(BORDER) }),
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
  const mainStages = stages.filter(s => !/survey|ground investigation/i.test(s.stage || ''))
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
    { test: s => /tender|procurement/i.test(s), color: '4472C4' },
    { test: s => /construction|phase/i.test(s), color: '1A2E4A' },
    { test: s => /handover/i.test(s),           color: '4A5568' },
    { test: s => /governance/i.test(s),         color: '7B3F00' },
    { test: () => true,                         color: '2E75B6' },
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
  const RAG_SOL = { High: 'C0392B', Medium: 'ED7D31', Low: '70AD47' }

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

// ─── Main export ───────────────────────────────────────────────────────────────

export async function buildReport({ answers, cost, programme, aiProse }) {
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
    ...(programme?.stages?.length > 0 ? [programmeTable(programme.stages, programme.totalWeeks), empty(), ...(ganttTable(programme.stages, programme.totalWeeks, programme.surveyWeeks) || [])] : []),
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

    subHdr('Cost Assumptions'),
    ...costAssumptionParas(cost, answers),

    subHdr('Cost Exclusions'),
    ...COST_EXCLUSIONS.map(e => bul(e)),
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
