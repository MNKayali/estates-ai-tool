import { describe, it, expect } from 'vitest'
import sample from './fixtures/sample-report-2026-09-23.json'
import { worstCaseReport, longScopeReport } from '../reportFixtures.js'
import {
  scopeGroups, notInScopeLines, notPricedLines, estimateHeight, lateSectionBlocks, layoutLateSections, buildPageMap,
} from '../reportContent.js'
import { PAGE } from '../reportStyle.js'

describe('scope page', () => {
  it('groups ticked items by their workbook group, client counts inline', () => {
    const g = scopeGroups(sample.cost)
    expect(g.find(x => /Toilets/.test(x.label)).items).toContain('Toilets — Standard (18)')
    expect(notInScopeLines(sample.cost).length).toBeLessThanOrEqual(6)
    expect(notPricedLines(sample.cost)).toEqual([])
  })
})

describe('late sections', () => {
  const items = n => [{ band: 1 }, { list: Array.from({ length: n }, () => 'x'.repeat(300)) }]
  const small = [{ band: 1 }, { para: 'x'.repeat(300) }] // ≈ 154 px
  const medium = items(3)                                // ≈ 320 px
  const tall = items(6)                                  // ≈ 566 px: more than a half, less than a page
  const huge = items(10)                                 // ≈ 894 px: most of a page

  it('splits a page at the middle when both sections fit a half', () => {
    expect(layoutLateSections([{ key: 'roi', blocks: small }, { key: 'procurement', blocks: small }, { key: 'constraints', blocks: small }]))
      .toEqual([[{ key: 'roi', slot: 'top' }, { key: 'procurement', slot: 'bottom' }], [{ key: 'constraints', slot: 'top' }]])
  })
  it('lets the second section follow the first when it is taller than a half but both fit', () => {
    expect(estimateHeight(tall)).toBeGreaterThan(PAGE.halfSlotPx)
    expect(layoutLateSections([{ key: 'roi', blocks: small }, { key: 'procurement', blocks: tall }]))
      .toEqual([[{ key: 'roi', slot: 'flow' }, { key: 'procurement', slot: 'flow' }]])
  })
  it('gives sections their own pages when they cannot share', () => {
    expect(layoutLateSections([{ key: 'procurement', blocks: huge }, { key: 'constraints', blocks: huge }]))
      .toEqual([[{ key: 'procurement', slot: 'full' }], [{ key: 'constraints', slot: 'full' }]])
    expect(estimateHeight(medium)).toBeLessThan(estimateHeight(tall))
  })
  it('keeps the sample to two late pages', () => {
    const keys = ['roi', 'procurement', 'constraints']
    expect(layoutLateSections(keys.map(key => ({ key, blocks: lateSectionBlocks(key, sample) })))).toHaveLength(2)
  })
})

describe('page map', () => {
  it('fixes the order: scope is page 3, next steps is last', () => {
    const { pages, ctx } = buildPageMap(sample)
    expect(pages.slice(0, 7).map(p => p.kind)).toEqual(['cover', 'summary', 'scope', 'risk', 'programme', 'costWorks', 'costSummary'])
    expect(pages.at(-1).kind).toBe('last')
    expect(pages.filter(p => p.kind === 'late')).toHaveLength(2)
    expect(ctx.totalPages).toBe(pages.length)
  })
  it('adds Appendix A after the last page for a long scope', () => {
    const { pages } = buildPageMap(longScopeReport(sample))
    const i = pages.findIndex(p => p.kind === 'last')
    expect(pages.slice(i + 1).every(p => p.kind === 'appendix')).toBe(true)
    expect(pages.length).toBeGreaterThan(i + 1)
  })
  it('builds a worst case with capped content', () => {
    const w = worstCaseReport(sample)
    expect(w.aiProse.riskRegister).toHaveLength(10)
    expect(w.answers.q1_0_projectName.length).toBeGreaterThanOrEqual(88)
  })
})
