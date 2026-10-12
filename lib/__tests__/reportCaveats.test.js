import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import sample from './fixtures/sample-report-2026-09-23.json'
import { buildReport } from '../reportBuilder.js'
import { worstCaseReport } from '../reportFixtures.js'
import { IMPORTANT_NOTICE, NOTICE_SHORT, FOOTER_TAG, SECTION_CAVEATS, NEXT_STEPS_TITLE } from '../reportContent.js'

// The owner's rule (29 September 2026): every report carries a caveat for
// every section and states that Projento accepts no responsibility for
// reliance on it. These tests hold both renderers to that — a new section
// heading without its caveat fails here.

const DOC = path.join(process.cwd(), 'app', 'report', 'doc')

describe('every section heading carries its caveat', () => {
  it('screen / PDF: every <Band> passes a caveat from SECTION_CAVEATS', () => {
    for (const f of fs.readdirSync(DOC).filter(f => f.endsWith('.jsx'))) {
      const src = fs.readFileSync(path.join(DOC, f), 'utf8')
      for (const m of src.matchAll(/<Band\b[^>]*\/>/g)) {
        expect(m[0], `${f}: ${m[0]}`).toMatch(/caveat=\{SECTION_CAVEATS\.\w+\}/)
      }
    }
  })

  it('Word: every section band is built through head(), which adds the caveat', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'docx', 'pages.js'), 'utf8')
    const bare = [...src.matchAll(/\bband\(/g)].filter(m => !src.slice(Math.max(0, m.index - 40), m.index).includes('return ['))
    expect(bare.map(m => src.slice(m.index, m.index + 60))).toEqual([])
    for (const m of src.matchAll(/head\([^)]*'(\w+)'\)/g)) expect(SECTION_CAVEATS[m[1]], m[0]).toBeTruthy()
  })

  it('the notice says Projento accepts no responsibility, and nothing is excluded that the law does not allow', () => {
    expect(IMPORTANT_NOTICE).toMatch(/Projento accepts no responsibility or liability/)
    expect(IMPORTANT_NOTICE).toMatch(/any third party/)
    expect(IMPORTANT_NOTICE).toMatch(/cannot be excluded by law/)
    expect(NOTICE_SHORT).toMatch(/accepts no liability/)
  })
})

describe('a built Word report carries the notice, the cover line, the footer and every section caveat', () => {
  const text = async data => {
    const zip = await JSZip.loadAsync(await buildReport(data))
    const xml = await Promise.all(Object.keys(zip.files).filter(f => /^word\/(document|footer\d*)\.xml$/.test(f)).map(f => zip.file(f).async('string')))
    return xml.join(' ').replace(/<[^>]+>/g, ' ').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  }

  it.each([
    ['a report from before the procurement workbook', () => ({ ...sample })],
    ['a current report at every limit', () => worstCaseReport(sample)],
  ])('%s', async (_name, make) => {
    const doc = await text(make())
    expect(doc).toContain(IMPORTANT_NOTICE)
    expect(doc).toContain(NOTICE_SHORT)
    expect(doc).toContain(FOOTER_TAG)
    expect(doc).toContain(NEXT_STEPS_TITLE)
    expect(doc).not.toContain('Recommendations and Next Steps')
    for (const [key, line] of Object.entries(SECTION_CAVEATS)) expect(doc, key).toContain(line)
  })
})
