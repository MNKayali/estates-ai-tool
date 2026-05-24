/**
 * create-template.mjs — Generates Estates_AI_Report_Template.docx
 *
 * Run: node scripts/create-template.mjs
 * Output: Estates_AI_Report_Template.docx (at project root — push to GitHub)
 *
 * The file uses {TAG} placeholders processed by docxtemplater at runtime.
 * Table rows use {#array}...{/array} loop syntax.
 * After generating, push to GitHub so the app can fetch it.
 */
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
         WidthType, HeadingLevel, AlignmentType, BorderStyle, ShadingType,
         convertInchesToTwip } from 'docx'
import { writeFileSync } from 'fs'

// ─── Shared styles ────────────────────────────────────────────────────────────
const NAVY  = '1F3864'
const WHITE = 'FFFFFF'
const LGREY = 'F2F2F2'

const heading = (text, level = 1) => new Paragraph({
  heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
  children: [new TextRun({ text, bold: true, color: NAVY })],
  spacing: { before: 240, after: 120 },
})

const para = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, ...opts })],
  spacing: { before: 60, after: 60 },
})

const tag = (name) => new TextRun({ text: `{${name}}` })
const tagPara = (name, opts = {}) => new Paragraph({
  children: [new TextRun({ text: `{${name}}`, ...opts })],
  spacing: { before: 60, after: 60 },
})

// ─── Table builders ───────────────────────────────────────────────────────────
function headerRow(cells, shading = NAVY) {
  return new TableRow({
    tableHeader: true,
    children: cells.map(text => new TableCell({
      shading: { fill: shading, type: ShadingType.SOLID },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: WHITE, size: 18 })], spacing: { before: 40, after: 40 } })],
    })),
  })
}

function loopRow(cells, loopOpen, loopClose) {
  return new TableRow({
    children: cells.map((text, i) => new TableCell({
      shading: { fill: LGREY, type: ShadingType.SOLID },
      children: [new Paragraph({
        children: [
          ...(i === 0 ? [new TextRun({ text: loopOpen })] : []),
          new TextRun({ text }),
          ...(i === cells.length - 1 ? [new TextRun({ text: loopClose })] : []),
        ],
        spacing: { before: 40, after: 40 },
      })],
    })),
  })
}

function simpleTable(headers, loopName, cellTags) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      headerRow(headers),
      loopRow(cellTags, `{#${loopName}}`, `{/${loopName}}`),
    ],
  })
}

// ─── Document sections ────────────────────────────────────────────────────────
function coverSection() {
  return [
    new Paragraph({ spacing: { before: 0, after: 480 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'RIBA STAGE 1 FEASIBILITY REPORT', bold: true, size: 52, color: NAVY })],
    }),
    new Paragraph({ spacing: { before: 240, after: 120 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Project: ', bold: true, size: 36 }), tag('PROJ_NAME')],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Date: ', size: 28 }), tag('PROJ_DATE')],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Confidence Grade: ', size: 28 }), tag('PROJ_CONFIDENCE'), new TextRun({ text: ' | Risk: ', size: 28 }), tag('PROJ_RISK_BADGE')],
    }),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

function execSummarySection() {
  return [
    heading('1. Executive Summary'),
    tagPara('EXEC_SUMMARY'),
    new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: 'Key Findings', bold: true })] }),
    tagPara('KEY_FINDING_1'),
    tagPara('KEY_FINDING_2'),
    tagPara('KEY_FINDING_3'),
    tagPara('KEY_FINDING_4'),
  ]
}

function scopeSection() {
  return [
    heading('2. Scope of Works'),
    new Paragraph({ children: [new TextRun({ text: 'Included Works', bold: true })], spacing: { before: 120, after: 60 } }),
    tagPara('SCOPE_INCLUDED'),
    new Paragraph({ children: [new TextRun({ text: 'Exclusions', bold: true })], spacing: { before: 120, after: 60 } }),
    tagPara('SCOPE_EXCLUDED'),
    new Paragraph({ children: [new TextRun({ text: 'Scope Assumptions', bold: true })], spacing: { before: 120, after: 60 } }),
    tagPara('SCOPE_ASSUMPTIONS'),
  ]
}

function riskSection() {
  return [
    heading('3. Risk Register'),
    simpleTable(
      ['Ref', 'Category', 'Description', 'L', 'I', 'Rating', 'Mitigation'],
      'riskRows',
      ['{ref}', '{category}', '{description}', '{likelihood}', '{impact}', '{rating}', '{mitigation}']
    ),
  ]
}

function programmeSection() {
  return [
    heading('4. High-Level Programme'),
    new Paragraph({
      children: [
        new TextRun({ text: 'Total programme: ', bold: true }),
        tag('PROG_TOTAL_WEEKS'),
        new TextRun({ text: ' weeks | Procurement route: ' }),
        tag('PROG_ROUTE'),
      ],
      spacing: { before: 60, after: 120 },
    }),
    tagPara('PROG_TARGET_STATUS'),
    simpleTable(
      ['Stage', 'Activity', 'Duration (weeks)'],
      'progRows',
      ['{stage}', '{activity}', '{durationWks}']
    ),
    new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: 'Milestones', bold: true })] }),
    tagPara('PROG_MILESTONES'),
    new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: 'Programme Assumptions', bold: true })] }),
    tagPara('PROG_ASSUMPTIONS'),
  ]
}

function costSection() {
  return [
    heading('5. Order of Cost Estimate (NRM1)'),
    new Paragraph({
      children: [
        new TextRun({ text: 'GIFA: ', bold: true }), tag('COST_GIFA'), new TextRun({ text: ' m²   ' }),
        new TextRun({ text: 'Region: ', bold: true }), tag('COST_REGION'), new TextRun({ text: '   ' }),
        new TextRun({ text: 'BCIS Factor: ', bold: true }), tag('COST_FACTOR'), new TextRun({ text: '   ' }),
        new TextRun({ text: 'Specification: ', bold: true }), tag('COST_SPEC'),
      ],
      spacing: { before: 60, after: 60 },
    }),
    tagPara('COST_NARRATIVE'),
    new Paragraph({ children: [new TextRun({ text: 'Section 1 — Works Cost', bold: true })], spacing: { before: 120, after: 60 } }),
    simpleTable(
      ['Code', 'Element', 'Unit', 'Rate (£)', 'Qty', 'Total (£)'],
      'worksRows',
      ['{code}', '{description}', '{unit}', '{rate}', '{qty}', '{lineMid}']
    ),
    new Paragraph({ children: [new TextRun({ text: 'Section 2 — Construction Cost', bold: true })], spacing: { before: 120, after: 60 } }),
    simpleTable(
      ['Item', 'Rate', 'Amount (£)'],
      'constructionRows',
      ['{item}', '{rate}', '{amount}']
    ),
    new Paragraph({ children: [new TextRun({ text: 'Section 3 — Total Project Cost', bold: true })], spacing: { before: 120, after: 60 } }),
    simpleTable(
      ['Item', 'Rate', 'Amount (£)'],
      'totalRows',
      ['{item}', '{rate}', '{amount}']
    ),
    new Paragraph({
      children: [new TextRun({ text: 'Total Cost Range: ', bold: true }), tag('COST_TOTAL_RANGE'), new TextRun({ text: '   Cost Risk: ' }), tag('COST_RISK_BADGE')],
      spacing: { before: 120, after: 60 },
    }),
    new Paragraph({ children: [new TextRun({ text: 'Cost Assumptions', bold: true })], spacing: { before: 120, after: 60 } }),
    tagPara('COST_ASSUMPTIONS'),
    new Paragraph({ children: [new TextRun({ text: 'Cost Exclusions', bold: true })], spacing: { before: 60, after: 60 } }),
    tagPara('COST_EXCLUSIONS'),
  ]
}

function roiSection() {
  return [
    heading('6. ROI & Financial Case'),
    new Paragraph({
      children: [
        new TextRun({ text: 'Benefit type: ' }), tag('ROI_BENEFIT_TYPE'), new TextRun({ text: '   Annual benefit: ' }), tag('ROI_ANNUAL'),
        new TextRun({ text: '   Project cost (mid): ' }), tag('ROI_MID_COST'), new TextRun({ text: '   Simple payback: ' }), tag('ROI_PAYBACK'),
      ],
      spacing: { before: 60, after: 120 },
    }),
    tagPara('ROI_NARRATIVE'),
  ]
}

function procurementSection() {
  return [
    heading('7. Procurement Recommendation'),
    new Paragraph({
      children: [
        new TextRun({ text: 'Route: ', bold: true }), tag('PROC_ROUTE'),
        new TextRun({ text: '   Contract: ', bold: true }), tag('PROC_CONTRACT'),
      ],
      spacing: { before: 60, after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Design responsibility: ' }), tag('PROC_DESIGN_RESP'),
        new TextRun({ text: '   Tender type: ' }), tag('PROC_TENDER_TYPE'),
      ],
      spacing: { before: 60, after: 120 },
    }),
    tagPara('PROC_NARRATIVE'),
    new Paragraph({ children: [new TextRun({ text: 'Commercial Considerations', bold: true })], spacing: { before: 120, after: 60 } }),
    tagPara('PROC_CONSIDERATIONS'),
    tagPara('PROC_CONFLICTS'),
  ]
}

function constraintsSection() {
  return [
    heading('8. Constraints Summary'),
    simpleTable(
      ['Category', 'Constraint', 'Impact'],
      'constraintRows',
      ['{category}', '{title}', '{text}']
    ),
  ]
}

function nextStepsSection() {
  return [
    heading('9. Recommendations & Next Steps'),
    tagPara('NEXT_STEPS'),
  ]
}

function disclaimerSection() {
  return [
    new Paragraph({ pageBreakBefore: true }),
    heading('Disclaimer', 3),
    para(
      'This report has been produced at RIBA Stage 0–1 using benchmark cost and programme data from published industry sources (BCIS, RICS, Cushman & Wakefield). ' +
      'All figures are indicative and subject to change following completion of surveys, design development, and competitive procurement. ' +
      'This report does not constitute a formal cost plan and should not be used as the basis for a financial commitment without review by a Chartered Quantity Surveyor. ' +
      'Programme durations are indicative and assume standard productivity and client decision-making within the gateway periods shown.',
      { italics: true, size: 18 }
    ),
  ]
}

// ─── Build & write ────────────────────────────────────────────────────────────
async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(0.8), right: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(0.8) },
        },
      },
      children: [
        ...coverSection(),
        ...execSummarySection(),
        ...scopeSection(),
        ...riskSection(),
        ...programmeSection(),
        ...costSection(),
        ...roiSection(),
        ...procurementSection(),
        ...constraintsSection(),
        ...nextStepsSection(),
        ...disclaimerSection(),
      ],
    }],
  })

  const buf = await Packer.toBuffer(doc)
  writeFileSync('Estates_AI_Report_Template.docx', buf)
  console.log('✅ Template created: Estates_AI_Report_Template.docx')
  console.log('   Push this file to GitHub at the root of your repository.')
  console.log('   Set TEMPLATE_FILE_URL = https://raw.githubusercontent.com/MNKayali/estates-ai-tool/main/Estates_AI_Report_Template.docx')
}

main().catch(err => { console.error('❌', err); process.exit(1) })
