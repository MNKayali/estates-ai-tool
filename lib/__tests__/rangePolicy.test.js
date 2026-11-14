import { it, expect } from 'vitest'
import fs from 'node:fs'
import JSZip from 'jszip'
import { calculateCost } from '../costCalculator.js'
import { rangeSentence } from '../reportShared.js'
import { accuracyStatement } from '../reportContent.js'
import { buildReport } from '../reportBuilder.js'
const sample = JSON.parse(fs.readFileSync('public/sample/report.json', 'utf8'))
it.each([['A', .925, 1.075, 15], ['B', .9, 1.1, 20], ['C', .85, 1.15, 30], ['D', .8, 1.2, 40]])('applies approved Excel spread %s without moving the central estimate', async (grade, low, high, spread) => {
  const cost = await calculateCost(sample.answers, 0, 0, { rangeGrade: grade })
  const provisional = await calculateCost(sample.answers, 0)
  expect(cost.total.mid).toBe(provisional.total.mid)
  expect(cost.rangeApplied).toMatchObject({ grade, low, high, fromWorkbook: true })
  expect((high-low)*100).toBeCloseTo(spread)
  expect(cost.total.low).toBeLessThan(cost.total.mid)
  expect(cost.total.high).toBeGreaterThan(cost.total.mid)
  if (grade === 'A') {
    expect(rangeSentence(cost)).toContain('−7.5% / +7.5%')
    expect(accuracyStatement(cost)).toContain('−7.5% / +7.5%')
    const bytes = await buildReport({ ...sample, cost, confidence: { ...sample.confidence, score: grade } })
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('word/document.xml').async('string')).toContain('7.5%')
  }
})
