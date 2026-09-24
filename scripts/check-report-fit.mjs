// scripts/check-report-fit.mjs
/**
 * Proves every report page fits its A4 sheet. Run against a gate-open dev
 * server (node scripts/dev-open.mjs):
 *   node scripts/check-report-fit.mjs [origin] [--pdf outDir]
 * Checks /report-fixture/{sample,worst,long-scope}: content above the running
 * footer, half-page slots not overflowing, Scope of Works on page 3, Next
 * Steps last before any appendix. With --pdf, also writes each fixture as a PDF.
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'

const origin = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:3000'
const pdfIdx = process.argv.indexOf('--pdf')
const outDir = pdfIdx > 0 ? process.argv[pdfIdx + 1] : null
const FIXTURES = ['sample', 'worst', 'long-scope']

const browser = await puppeteer.launch({ headless: true })
let failures = 0
try {
  for (const name of FIXTURES) {
    const page = await browser.newPage()
    await page.setViewport({ width: 900, height: 1200 })
    await page.goto(`${origin}/report-fixture/${name}?pdf=1`, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForSelector('.r-cover', { timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    const result = await page.evaluate(() => {
      const problems = []
      const pages = [...document.querySelectorAll('.r-page')]
      pages.forEach((pg, i) => {
        const body = pg.querySelector('.r-body')
        const footer = pg.querySelector('.r-rf')
        if (body && footer) {
          const lastBottom = Math.max(...[...body.querySelectorAll('*')].map(el => el.getBoundingClientRect().bottom))
          const room = footer.getBoundingClientRect().top - lastBottom
          if (room < 2) problems.push(`page ${i + 1}: content runs ${Math.round(-room)}px into the footer`)
        }
        pg.querySelectorAll('.r-slot-top').forEach(s => {
          if (s.scrollHeight > s.clientHeight + 1) problems.push(`page ${i + 1}: top half-page slot overflows by ${s.scrollHeight - s.clientHeight}px`)
        })
      })
      const title = i => pages[i]?.querySelector('.r-band h2')?.textContent || ''
      if (title(2) !== 'Scope of Works') problems.push(`page 3 is "${title(2)}", expected Scope of Works`)
      const lastIdx = pages.findIndex(pg => pg.querySelector('.r-band h2')?.textContent === 'Recommendations and Next Steps')
      if (lastIdx < 0 || pages.slice(lastIdx + 1).some(pg => !/Appendix A/.test(pg.querySelector('.r-band h2')?.textContent || ''))) problems.push('Next Steps is not the last page before the appendix')
      return { count: pages.length, problems }
    })
    console.log(`${name}: ${result.count} pages${result.problems.length ? '' : ' — all fit'}`)
    for (const p of result.problems) { console.log(`  ✗ ${p}`); failures++ }
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true })
      await page.pdf({ path: path.join(outDir, `report-${name}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    }
    await page.close()
  }
} finally {
  await browser.close()
}
process.exit(failures ? 1 : 0)
