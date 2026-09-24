import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import sample from '../../public/sample/report.json'
import { buildReport } from '../reportBuilder.js'
import { FONTS } from '../reportStyle.js'

// The Word report embeds IBM Plex, uses no other font, follows the same page
// order as the screen and PDF, and is a file Word will open.
describe('Word report', () => {
  it('embeds IBM Plex under part names Word accepts, and uses no other font', async () => {
    const zip = await JSZip.loadAsync(await buildReport({ ...sample }))
    const fontParts = Object.keys(zip.files).filter(f => /^word\/fonts\/.+\.odttf$/.test(f))
    expect(fontParts).toHaveLength(3)
    // A space in an OPC part name makes Word report the file as corrupted.
    expect(fontParts.every(f => !/\s/.test(f))).toBe(true)
    const rels = await zip.file('word/_rels/fontTable.xml.rels').async('string')
    for (const f of fontParts) expect(rels).toContain(`Target="${f.replace('word/', '')}"`)
    const fontTable = await zip.file('word/fontTable.xml').async('string')
    for (const name of Object.values(FONTS.word)) expect(fontTable).toContain(`w:name="${name}"`)

    const doc = await zip.file('word/document.xml').async('string')
    const used = new Set([...doc.matchAll(/w:ascii="([^"]+)"/g)].map(m => m[1]))
    for (const f of used) expect(Object.values(FONTS.word)).toContain(f)
  })

  it('follows the page map and carries no questionnaire numbers', async () => {
    const zip = await JSZip.loadAsync(await buildReport({ ...sample }))
    const text = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const order = ['Executive Summary', 'Scope of Works', 'Risk Register', 'High-Level Programme', 'Order of Cost Estimate',
      'Financial Case', 'Procurement Recommendation', 'Constraints Summary', 'Recommendations and Next Steps']
    const at = order.map(s => text.indexOf(s))
    expect(at.every(i => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(text).not.toMatch(/\(Q\d/)
    expect(text).toContain('Further information')
  })
})
