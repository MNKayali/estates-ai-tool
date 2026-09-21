/* Builds docs/New_Build_question_set_FOR_REVIEW.docx */
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageOrientation,
} = require('docx')

const NAVY = '1A2E4A'
const AMBER = '9D6B15'
const GREY = '6D7182'
const LINE = 'D8D5CE'
const TINT = 'F4F1EA'

const W = 13958 // usable width, landscape A4 with 1" margins

const cellBorders = {
  top:    { style: BorderStyle.SINGLE, size: 2, color: LINE },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
  left:   { style: BorderStyle.SINGLE, size: 2, color: LINE },
  right:  { style: BorderStyle.SINGLE, size: 2, color: LINE },
}

const p = (text, opts = {}) => new Paragraph({
  spacing: { before: opts.before ?? 0, after: opts.after ?? 80 },
  alignment: opts.align,
  children: [new TextRun({
    text, bold: opts.bold, italics: opts.italics,
    size: opts.size ?? 19, color: opts.color ?? '1A1A1A', font: 'Arial',
  })],
})

const bullet = text => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 70 },
  children: [new TextRun({ text, size: 19, font: 'Arial', color: '1A1A1A' })],
})

const h1 = text => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 340, after: 140 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: AMBER, space: 6 } },
  children: [new TextRun({ text, bold: true, size: 26, color: NAVY, font: 'Arial' })],
})

const cell = (children, width, opts = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  borders: cellBorders,
  shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade, color: 'auto' } : undefined,
  margins: { top: 90, bottom: 90, left: 120, right: 120 },
  children,
})

const headerRow = (labels, widths) => new TableRow({
  tableHeader: true,
  children: labels.map((l, i) => cell(
    [new Paragraph({ children: [new TextRun({ text: l, bold: true, size: 18, color: 'FFFFFF', font: 'Arial' })] })],
    widths[i], { shade: NAVY })),
})

const bodyRow = (cells, widths, shade) => new TableRow({
  children: cells.map((c, i) => cell(
    (Array.isArray(c) ? c : [c]).map(line =>
      typeof line === 'string'
        ? new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, size: 18, font: 'Arial' })] })
        : line),
    widths[i], { shade: i === cells.length - 1 ? TINT : shade })),
})

const small = (text, opts = {}) => new Paragraph({
  spacing: { after: 40 },
  children: [new TextRun({ text, size: 17, italics: opts.italics, bold: opts.bold, color: opts.color ?? GREY, font: 'Arial' })],
})

// ── Part A — existing Section 3 questions ────────────────────────────────────
const AW = [900, 3300, 3700, 3400, 2658]
const EXISTING = [
  ['Q3.1', 'Known building issues\nAsbestos, structural concerns, ageing M&E, damp, drainage, fire safety, contaminated land, unsure, none',
    'REPLACE with the new site questions (NB1–NB4)',
    'Six of its nine options describe a building that does not exist yet. The cost engine reads this answer, so it cannot simply be switched off — it has to be replaced.'],
  ['Q3.2', 'Previous works or relevant history\nFree text',
    'HIDE for New Build',
    'There is no history to describe. Only the AI narrative reads it, so hiding it changes no number in the estimate.'],
  ['Q3.3', 'Surveys and reports available\nAsbestos register, Structural, Condition, Topographic, Ground investigation, Energy audit, Fire risk assessment',
    'KEEP, but change the option list',
    'Topographic and Ground investigation are the new-build ones. Suggest adding Ecological, Utility/services search and Archaeological, and dropping asbestos register, condition, fire risk and energy audit.'],
  ['Q3.4', 'Planning consent required', 'KEEP unchanged', 'Applies fully to a new build — arguably more than to a refurbishment.'],
  ['Q3.5', 'Access constraints', 'KEEP unchanged', 'Applies fully. Site access, deliveries and scaffold licences are all live issues on a new build.'],
  ['Q3.6', 'Occupation during works\nFully occupied / Partially occupied / Vacant or decanted',
    'KEEP, but re-word the question',
    'There is no building to occupy — but a live campus or operating site around the plot is real and it does price. Re-word to ask about the surrounding site rather than the building.'],
  ['Q3.7', 'Additional context', 'KEEP unchanged', 'Free text; always useful.'],
  ['Q3.8', 'Site and building context\nConservation area, party wall, higher-risk building, ecological features',
    'KEEP unchanged', 'All four apply to a new build.'],
  ['Q1.4', 'Building age', 'Already hidden — no change needed', 'This is one of only three questions in the whole form that already react to project type.'],
]

// ── Part B — proposed new questions ──────────────────────────────────────────
const BW = [800, 4300, 3400, 2800, 2658]
const NEWQ = [
  ['NB1', 'Site status',
    ['Greenfield — undeveloped land', 'Brownfield — cleared and ready', 'Brownfield — structures still standing', 'Unsure'],
    'Decides whether demolition and hazardous-removal elements are offered at all, and whether a demolition period is added to the programme.',
    'YES — elements 0.1 and 0.2 have no New Build rate today, so they cannot be priced on a new build at all.'],
  ['NB2', 'Floor area of structures to be demolished (m²)',
    ['Number — only asked if NB1 = structures still standing'],
    'Prices element 0.2 Demolition & structural alterations, and adds a demolition stage ahead of the main construction period.',
    'YES — a New Build rate on 0.2, plus a Durations row for the demolition stage.'],
  ['NB3', 'Ground conditions',
    ['Ground investigation done — no issues found', 'Made ground or fill', 'High water table', 'Rock or hard strata', 'Known contamination', 'Not yet investigated'],
    'Points at standard versus piled foundations (1.1 vs 1.2), and drives a risk allowance where the ground is still unknown.',
    'YES — a Tab 3 percentage rule keyed to this answer.'],
  ['NB4', 'Underground obstructions or service diversions',
    ['None known', 'Existing foundations or slabs to break out', 'Live services crossing the site', 'Diversion already agreed with the utility', 'Unsure'],
    'Cannot be priced at all today — no element exists for it. Also a significant programme item: utility diversions commonly run to months.',
    'YES — a new Master Cost Table row, and a Durations row for the diversion lead time.'],
  ['NB5', 'Trees, hedgerow or protected trees on site',
    ['None', 'Trees to be retained', 'Trees to be removed', 'TPO or conservation-area trees', 'Unsure'],
    'Adds a planning risk to the register, and can trigger the ecology survey stage that already exists in the programme workbook.',
    'PARTLY — the ecology survey stage (SV7) already exists. A Tab 3 rule is only needed if you want this to move a cost as well.'],
  ['NB6', 'Incoming utility supply',
    ['Existing connection with spare capacity', 'New or upgraded electrical connection needed (DNO)', 'New gas connection needed', 'New water or drainage connection needed', 'Unsure'],
    'Adds the DNO lead time to the programme — usually the single longest lead item on a new build, and the one most likely to move a completion date.',
    'PARTLY — element 5.13 Grid connection / DNO upgrade already exists. Needs a Durations row for the lead time.'],
  ['NB7', 'Site topography',
    ['Level', 'Gentle slope', 'Significant level change or retaining structures needed', 'Unsure'],
    'Drives the substructure allowance and the contractor’s preliminaries.',
    'YES — a Tab 3 percentage rule.'],
]

const doc = new Document({
  styles: { default: { document: { run: { font: 'Arial', size: 19 } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 },
      },
    },
    children: [
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: 'NEW BUILD — PROPOSED QUESTION SET', bold: true, size: 34, color: NAVY, font: 'Arial' })],
      }),
      new Paragraph({
        spacing: { after: 260 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: AMBER, space: 8 } },
        children: [new TextRun({ text: 'For review — Estates AI Stage 0–1 tool · 20 September 2026', size: 20, color: GREY, font: 'Arial' })],
      }),

      p('How to use this document', { bold: true, size: 22, color: NAVY, after: 100 }),
      bullet('Every row has a "Your comment" box on the right. Write in it — that is the only thing you need to do.'),
      bullet('Nothing here is built yet. This is the proposal; your comments decide what gets built.'),
      bullet('Where a row says a workbook change is needed, that is an edit you would make in Excel — the app cannot invent a rate or a duration.'),

      h1('Why this document exists'),
      p('At the moment the questionnaire asks almost every question of every project type. Only three questions in the entire form change based on what you choose at Q1.2 — number of storeys, building age, and level of intervention. Everything else is asked of everyone.'),
      p('That is why a new build is asked about asbestos, damp and previous works on a building that does not exist yet.'),
      p('Checking the cost workbook turned up something more serious while preparing this:', { before: 120 }),
      new Paragraph({
        spacing: { before: 60, after: 140 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: AMBER, space: 10 } },
        indent: { left: 200 },
        children: [new TextRun({
          text: 'On a New Build project you cannot price demolition at all. Elements 0.1 (hazardous material removal) and 0.2 (demolition & structural alterations) have no New Build rate in the workbook, so the picker hides them. A new build on a site with a building to knock down is currently unpriceable — and nothing tells you that.',
          size: 19, bold: true, color: '1A1A1A', font: 'Arial',
        })],
      }),
      p('So this is not just a question-wording exercise. New Build needs its own questions and the workbook needs rates to answer them against.'),

      h1('Part A — the eight questions you are asked today'),
      small('What should happen to each existing Section 3 question when the project type is New Build.', { italics: true }),
      new Table({
        columnWidths: AW,
        width: { size: W, type: WidthType.DXA },
        rows: [
          headerRow(['Q', 'The question today', 'Recommendation', 'Why', 'Your comment'], AW),
          ...EXISTING.map(([q, today, rec, why]) => bodyRow([
            [new Paragraph({ children: [new TextRun({ text: q, bold: true, size: 18, color: NAVY, font: 'Arial' })] })],
            today.split('\n').map((t, i) => new Paragraph({
              spacing: { after: 40 },
              children: [new TextRun({ text: t, size: 18, italics: i > 0, color: i > 0 ? GREY : '1A1A1A', font: 'Arial' })],
            })),
            [new Paragraph({ children: [new TextRun({ text: rec, bold: true, size: 18, color: /HIDE|REPLACE/.test(rec) ? AMBER : NAVY, font: 'Arial' })] })],
            why,
            '',
          ], AW)),
        ],
      }),

      new Paragraph({ children: [], spacing: { after: 200 } }),

      h1('Part B — the questions proposed to replace them'),
      small('These are new. They are the ones you described: land condition, what has to come down, what is buried, and what is growing on it.', { italics: true }),
      new Table({
        columnWidths: BW,
        width: { size: W, type: WidthType.DXA },
        rows: [
          headerRow(['#', 'Proposed question and options', 'What it changes in the report', 'Workbook change needed?', 'Your comment'], BW),
          ...NEWQ.map(([id, q, opts, drives, wb]) => bodyRow([
            [new Paragraph({ children: [new TextRun({ text: id, bold: true, size: 18, color: NAVY, font: 'Arial' })] })],
            [
              new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: q, bold: true, size: 18, font: 'Arial' })] }),
              ...opts.map(o => new Paragraph({
                bullet: { level: 0 }, spacing: { after: 20 },
                children: [new TextRun({ text: o, size: 17, color: GREY, font: 'Arial' })],
              })),
            ],
            drives,
            [new Paragraph({ children: [new TextRun({
              text: wb, size: 17,
              bold: wb.startsWith('YES'),
              color: wb.startsWith('YES') ? AMBER : '1A1A1A', font: 'Arial',
            })] })],
            '',
          ], BW)),
        ],
      }),

      new Paragraph({ children: [], spacing: { after: 200 } }),

      h1('Part C — three decisions I need from you'),
      new Table({
        columnWidths: [800, 6500, 6658],
        width: { size: W, type: WidthType.DXA },
        rows: [
          headerRow(['#', 'Decision', 'Your answer'], [800, 6500, 6658]),
          bodyRow(['1',
            'Do NB1–NB7 cover it? Cross out any you do not want, and add any I have missed. You mentioned land condition, demolition, contamination, underground services and trees — those are NB1 to NB5. NB6 (utility supply) and NB7 (topography) are my additions.',
            ''], [800, 6500, 6658]),
          bodyRow(['2',
            'The demolition gap. Elements 0.1 and 0.2 have no New Build rate. Do you want to add New Build rates to the workbook so a new build can include demolition — or should a project with demolition be entered as project type "Mixed" instead?',
            ''], [800, 6500, 6658]),
          bodyRow(['3',
            'How far do we go? New Build is one of eight project types. Do you want the other seven mapped the same way after this one, or is New Build enough for now?',
            ''], [800, 6500, 6658]),
        ],
      }),

      new Paragraph({ children: [], spacing: { after: 220 } }),
      small('Nothing in the application has been changed. This document and the earlier mapping workbook are the only outputs so far.', { italics: true }),
    ],
  }],
})

const out = path.join('C:/Users/nabil/estates-ai-tool/docs', 'New_Build_question_set_FOR_REVIEW.docx')
Packer.toBuffer(doc).then(b => { fs.writeFileSync(out, b); console.log('Wrote ' + out) })
