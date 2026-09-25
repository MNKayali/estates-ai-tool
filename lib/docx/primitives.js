/**
 * lib/docx/primitives.js — the Word renderer's building blocks. Every colour,
 * size and font comes from lib/reportStyle.js; this is the only file allowed to
 * construct a TextRun (lib/__tests__/reportStyleGuard.test.js).
 */
import {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType,
  VerticalAlign, HeightRule, LevelFormat, PageNumber, TableLayoutType, ImageRun,
} from 'docx'
import { COLOURS, FONTS, TYPE, PAGE, hex, hp, pxToDxa, widthsToDxa } from '../reportStyle.js'

export const PAGE_DXA = { width: 11906, height: 16838 }
export const MARGIN_X = pxToDxa(PAGE.marginXPx)
export const CONTENT_DXA = PAGE_DXA.width - 2 * MARGIN_X

const clean = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/** The only TextRun constructor in the Word renderer (plus pageNumberRuns below). */
export function t(text, { size = TYPE.body, color = COLOURS.ink, semi = false, mono = false, italic = false, fill, tracking } = {}) {
  return new TextRun({
    text: clean(text),
    font: mono ? FONTS.word.mono : semi ? FONTS.word.semibold : FONTS.word.regular,
    size: hp(size),
    color: hex(color),
    italics: italic,
    ...(tracking ? { characterSpacing: tracking } : {}),
    ...(fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(fill) } } : {}),
  })
}

/** An inline logo. width/height in CSS px (docx's transformation unit). */
export function img(data, width, height, alt) {
  return new ImageRun({ type: 'png', data, transformation: { width, height }, altText: { name: alt, title: alt, description: alt } })
}

export function pageNumberRuns() {
  const base = { font: FONTS.word.regular, size: hp(TYPE.small), color: hex(COLOURS.greyMute) }
  return [
    new TextRun({ ...base, children: [PageNumber.CURRENT] }),
    new TextRun({ ...base, text: ' of ' }),
    new TextRun({ ...base, children: [PageNumber.TOTAL_PAGES] }),
  ]
}

export function p(children, { before = 0, after = 120, align = AlignmentType.LEFT, keepNext = false, pageBreakBefore = false, bullet = false, numbered = false, line = 264 } = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing: { before, after, line },
    alignment: align,
    keepNext,
    pageBreakBefore,
    ...(bullet ? { numbering: { reference: 'r-bullets', level: 0 } } : {}),
    ...(numbered ? { numbering: { reference: 'r-numbers', level: 0 } } : {}),
  })
}

export const NUMBERING = {
  config: [
    { reference: 'r-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { run: { color: hex(COLOURS.amberText) }, paragraph: { indent: { left: 360, hanging: 240 } } } }] },
    { reference: 'r-numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { run: { color: hex(COLOURS.amberText), font: FONTS.word.semibold }, paragraph: { indent: { left: 360, hanging: 300 } } } }] },
  ],
}

const NONE = { style: BorderStyle.NONE, size: 0, color: hex(COLOURS.paper) }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
export const rule = (colour, size = 4) => ({ style: BorderStyle.SINGLE, size, color: hex(colour) })

// docx draws table borders (including inside verticals) unless told not to;
// every table in the report sets its own lines per cell instead.
const NO_TABLE_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
// Fixed layout: Word keeps the column widths we give it instead of autofitting to content.
export const newTable = opts => new Table({ borders: NO_TABLE_BORDERS, layout: TableLayoutType.FIXED, ...opts })

export function cell(children, { width, fill, borders = {}, align = AlignmentType.LEFT, span, vAlign = VerticalAlign.TOP, margins } = {}) {
  const kids = (Array.isArray(children) ? children : [children])
    .map(c => (c instanceof Paragraph || c instanceof Table ? c : p(c, { after: 0, align, line: 252 })))
  // Word requires every table cell to end with a paragraph; a cell ending in a
  // nested table (pills, fact tables, the contact block) makes the file "corrupt".
  if (kids.length === 0 || kids[kids.length - 1] instanceof Table) kids.push(new Paragraph({ children: [], spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' } }))
  return new TableCell({
    children: kids,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(fill) } : undefined,
    borders: { ...NO_BORDERS, ...borders },
    columnSpan: span,
    verticalAlign: vAlign,
    margins: margins || { top: 40, bottom: 40, left: 110, right: 110 },
  })
}

/** Section band: navy number block, title, optional note; tinted, amber underline. */
export function band(no, title, note) {
  const label = typeof no === 'number' ? String(no).padStart(2, '0') : String(no)
  const under = { bottom: rule(COLOURS.amberRule, 12) }
  const noteW = 3600, noW = 700
  return newTable({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: [noW, CONTENT_DXA - noW - noteW, noteW],
    rows: [new TableRow({ cantSplit: true, children: [
      cell(p(t(label, { mono: true, color: COLOURS.paper, size: TYPE.table }), { after: 0, align: AlignmentType.CENTER }),
        { width: noW, fill: COLOURS.navy, borders: under, vAlign: VerticalAlign.CENTER }),
      cell(p(t(title, { semi: true, color: COLOURS.navy, size: TYPE.sectionTitle }), { after: 0 }),
        { width: CONTENT_DXA - noW - noteW, fill: COLOURS.tintBand, borders: under, vAlign: VerticalAlign.CENTER, margins: { top: 140, bottom: 140, left: 200, right: 110 } }),
      cell(p(t(note || '', { size: TYPE.small, color: COLOURS.greyMute }), { after: 0, align: AlignmentType.RIGHT }),
        { width: noteW, fill: COLOURS.tintBand, borders: under, vAlign: VerticalAlign.CENTER }),
    ] })],
  })
}

/**
 * Standard report table. rows: [{ cells: [string | Paragraph | Table], kind }]
 * kind: 'row' | 'group' | 'subtotal' | 'total' | 'ref' | 'high' | 'med' | 'low'
 */
export function table({ widths, head, rows, numeric = [], size = TYPE.table, width = CONTENT_DXA }) {
  const w = widthsToDxa(widths, width)
  const align = i => (numeric.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT)
  const headRow = head && new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: head.map((h, i) => cell(p(t(h, { semi: true, color: COLOURS.navy, size }), { after: 0, align: align(i), line: 252 }),
      { width: w[i], fill: COLOURS.tintHead, borders: { bottom: rule(COLOURS.navy, 8) } })),
  })
  const RAG_EDGE = { high: COLOURS.ragHigh, med: COLOURS.ragMed, low: COLOURS.ragLow }
  const body = rows.map(r => {
    if (r.kind === 'group') {
      return new TableRow({ cantSplit: true, children: [
        cell(p(t(r.cells[0], { semi: true, color: COLOURS.navy, size: TYPE.small }), { after: 0 }),
          { width, span: w.length, fill: COLOURS.tintGroup, borders: { left: rule(COLOURS.amberRule, 18) } }),
      ] })
    }
    const total = r.kind === 'total'
    const fill = total ? COLOURS.navy : r.kind === 'high' ? COLOURS.tintHigh : undefined
    const colour = total ? COLOURS.paper : r.kind === 'ref' ? COLOURS.grey : COLOURS.ink
    const strong = total || r.kind === 'subtotal'
    return new TableRow({ cantSplit: true, children: r.cells.map((c, i) => cell(
      c instanceof Paragraph || c instanceof Table ? c : p(t(c, { size, color: colour, semi: strong, italic: r.kind === 'ref' }), { after: 0, align: align(i), line: 252 }),
      {
        width: w[i],
        fill,
        borders: {
          bottom: rule(COLOURS.rule),
          ...(r.kind === 'subtotal' ? { top: rule(COLOURS.navy, 6) } : {}),
          ...(i === 0 && RAG_EDGE[r.kind] ? { left: rule(RAG_EDGE[r.kind], 30) } : {}),
        },
      },
    )) })
  })
  return newTable({ width: { size: width, type: WidthType.DXA }, columnWidths: w, rows: headRow ? [headRow, ...body] : body })
}

/** Rating pill: a shaded single-cell table with the word in capitals. */
export function pill(rating) {
  const fill = rating === 'High' ? COLOURS.ragHigh : rating === 'Low' ? COLOURS.ragLow : COLOURS.ragMed
  return newTable({
    width: { size: 1000, type: WidthType.DXA },
    columnWidths: [1000],
    rows: [new TableRow({ children: [
      cell(p(t(String(rating).toUpperCase(), { semi: true, color: COLOURS.paper, size: TYPE.small }), { after: 0, align: AlignmentType.CENTER }),
        { width: 1000, fill, margins: { top: 40, bottom: 40, left: 40, right: 40 } }),
    ] })],
  })
}

export const exactRow = (height, children) => new TableRow({ height: { value: height, rule: HeightRule.EXACT }, children })
