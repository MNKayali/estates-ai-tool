import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
         HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType } from 'docx'

// Inline markdown parser — converts **bold** and *italic* into TextRun arrays
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

export async function POST(request) {
  try {
    const { reportText, projectName, meta } = await request.json()

    const pageProps = {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    }

    // ── Cover page ──────────────────────────────────────────────────────────────
    const generatedDate = meta?.generatedAt
      ? new Date(meta.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const score = meta?.confidenceScore || 'C'
    const confLabel = { A:'High Confidence', B:'Moderate Confidence', C:'Limited Confidence', D:'High Uncertainty' }[score] || 'Limited Confidence'

    const coverChildren = [
      new Paragraph({ text: '', spacing: { after: 800 } }),
      new Paragraph({
        children: [new TextRun({ text: 'RIBA STAGE 0–1 FEASIBILITY REPORT', font:'Arial', size:22, bold:true, color:'64748B', allCaps:true })],
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [new TextRun({ text: projectName || 'Feasibility Report', font:'Arial', size:56, bold:true, color:'1F3864' })],
        spacing: { after: 560 },
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size:8, color:'1F3864' } },
        spacing: { after: 480 },
        children: [new TextRun({ text:'' })],
      }),
      new Paragraph({
        children: [
          new TextRun({ text:'Generated:  ', font:'Arial', size:20, bold:true, color:'64748B' }),
          new TextRun({ text: generatedDate, font:'Arial', size:20, color:'1A1A1A' }),
        ],
        spacing: { after: 160 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text:'Standard:   ', font:'Arial', size:20, bold:true, color:'64748B' }),
          new TextRun({ text:'RIBA Stage 0–1', font:'Arial', size:20, color:'1A1A1A' }),
        ],
        spacing: { after: 160 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text:'Confidence: ', font:'Arial', size:20, bold:true, color:'64748B' }),
          new TextRun({ text: score + ' — ' + confLabel, font:'Arial', size:20, color:'1A1A1A' }),
        ],
        spacing: { after: 160 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text:'Produced by:', font:'Arial', size:20, bold:true, color:'64748B' }),
          new TextRun({ text:' Estates AI Tool', font:'Arial', size:20, color:'1A1A1A' }),
        ],
        spacing: { after: 800 },
      }),
      new Paragraph({
        children: [new TextRun({ text:'This report is indicative only and has not been produced from measured quantities or detailed design. Refer to the disclaimer at the end of this report.', font:'Arial', size:18, italics:true, color:'94A3B8' })],
        spacing: { after: 0 },
      }),
    ]

    // ── Report body ─────────────────────────────────────────────────────────────
    const children = []
    const lines = (reportText || '').split('\n')
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      if (line.startsWith('# ') && !line.startsWith('## ')) {
        children.push(new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.HEADING_1, spacing: { after:200 } }))
        i++; continue
      }
      if (line.startsWith('## ')) {
        children.push(new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_2, spacing: { before:400, after:150 } }))
        i++; continue
      }
      if (line.startsWith('### ')) {
        children.push(new Paragraph({ text: line.slice(4).trim(), heading: HeadingLevel.HEADING_3, spacing: { before:200, after:100 } }))
        i++; continue
      }
      if (line.trim() === '---') {
        children.push(new Paragraph({ text:'', spacing: { after:100 } }))
        i++; continue
      }
      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
        children.push(new Paragraph({
          children: parseInline(line.slice(2).trim(), { font:'Arial', size:20, color:'1A1A1A' }),
          bullet: { level:0 },
          spacing: { after:60 },
        }))
        i++; continue
      }
      if (/^\d+\.\s/.test(line)) {
        children.push(new Paragraph({
          children: parseInline(line.replace(/^\d+\.\s/,'').trim(), { font:'Arial', size:20, color:'1A1A1A' }),
          numbering: { reference:'default-numbering', level:0 },
          spacing: { after:60 },
        }))
        i++; continue
      }

      // Table detection
      if (line.startsWith('|') && i + 1 < lines.length && lines[i+1].startsWith('|')) {
        const tableLines = []
        while (i < lines.length && lines[i].startsWith('|')) {
          if (!lines[i].match(/^\|[-| ]+\|$/)) tableLines.push(lines[i])
          i++
        }
        const rows = tableLines.map(l =>
          l.split('|').filter((_,idx,arr) => idx>0 && idx<arr.length-1).map(c => c.trim())
        )
        if (rows.length > 0) {
          children.push(new Table({
            rows: rows.map((cells, rowIdx) => new TableRow({
              children: cells.map(cell => new TableCell({
                children: [new Paragraph({
                  children: parseInline(cell, { font:'Arial', size:18, bold: rowIdx===0, color: rowIdx===0 ? 'FFFFFF' : '1A1A1A' }),
                })],
                shading: rowIdx === 0
                  ? { type: ShadingType.SOLID, color:'1F3864', fill:'1F3864' }
                  : rowIdx % 2 === 0
                    ? { type: ShadingType.SOLID, color:'F5F5F5', fill:'F5F5F5' }
                    : undefined,
                width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
              })),
            })),
            width: { size:9000, type: WidthType.DXA },
          }))
          children.push(new Paragraph({ text:'', spacing: { after:200 } }))
        }
        continue
      }

      if (line.toUpperCase().includes('DISCLAIMER:')) {
        children.push(new Paragraph({
          children: parseInline(line.trim(), { font:'Arial', size:18, color:'1A1A1A' }),
          shading: { type: ShadingType.SOLID, color:'FFF3CD', fill:'FFF3CD' },
          spacing: { before:200, after:200 },
          border: {
            top:    { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
            bottom: { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
            left:   { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
            right:  { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
          },
        }))
        i++; continue
      }

      if (line.trim()) {
        children.push(new Paragraph({
          children: parseInline(line.trim(), { font:'Arial', size:20, color:'1A1A1A' }),
          spacing: { after:120 },
        }))
      }
      i++
    }

    // Disclaimer footer
    children.push(new Paragraph({ text:'', spacing: { after:400 } }))
    children.push(new Paragraph({
      children: [new TextRun({
        text:'DISCLAIMER: This feasibility report is indicative only, produced at RIBA Stage 0–1 without measured quantities or detailed design. Rates are based on BCIS £/m² benchmarks. This should be reviewed by a Chartered Quantity Surveyor before use in any business case, budget approval, or funding application.',
        font:'Arial', size:18, color:'1A1A1A',
      })],
      shading: { type: ShadingType.SOLID, color:'FFF3CD', fill:'FFF3CD' },
      spacing: { before:200, after:200 },
      border: {
        top:    { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
        bottom: { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
        left:   { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
        right:  { style: BorderStyle.SINGLE, size:6, color:'F4B942' },
      },
    }))

    const doc = new Document({
      numbering: {
        config: [{
          reference:'default-numbering',
          levels:[{ level:0, format:'decimal', text:'%1.', alignment: AlignmentType.LEFT }],
        }],
      },
      styles: {
        default: { document: { run: { font:'Arial', size:20, color:'1A1A1A' } } },
        paragraphStyles: [
          { id:'Heading1', name:'Heading 1', basedOn:'Normal', run:{ font:'Arial', size:36, bold:true, color:'1F3864' }, paragraph:{ spacing:{ after:200 } } },
          { id:'Heading2', name:'Heading 2', basedOn:'Normal', run:{ font:'Arial', size:26, bold:true, color:'1F3864' }, paragraph:{ spacing:{ before:400, after:150 } } },
          { id:'Heading3', name:'Heading 3', basedOn:'Normal', run:{ font:'Arial', size:22, bold:true, color:'1F3864' }, paragraph:{ spacing:{ before:200, after:100 } } },
        ],
      },
      sections: [
        { properties: pageProps, children: coverChildren },
        { properties: pageProps, children },
      ],
    })

    const buffer = await Packer.toBuffer(doc)
    const safeName = (projectName || 'Report').replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_')
    const date = new Date().toISOString().split('T')[0]

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeName}_RIBA_Stage1_${date}.docx"`,
      }
    })
  } catch (error) {
    console.error('[export-word]', error)
    return Response.json({ error: 'Word export failed', detail: error.message }, { status: 500 })
  }
}
