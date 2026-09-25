import { describe, it, expect } from 'vitest'
import sample from './fixtures/sample-report-2026-09-23.json'
import {
  money, compactMoney, coverCostRange, coverTitle, coverTitleSize, shortTitle, coverSubtitle,
  titleLooksThin, cleanReportText, fmtMonthYear, confidenceWord, reportReference, calcRoi,
} from '../reportContent.js'

describe('money', () => {
  it('rounds to £100 under a £100,000 project and £1,000 above', () => {
    expect(money(3044, 52000)).toBe('£3,000')
    expect(money(3160, 52000)).toBe('£3,200')
    expect(money(100800, 1994000)).toBe('£101,000')
    expect(money(100800, 1994000, { symbol: false })).toBe('101,000')
  })
  it('shortens only the cover figure at £1m and above', () => {
    expect(compactMoney(1600000)).toBe('£1.60m')
    expect(compactMoney(1994000)).toBe('£1.99m')
    expect(coverCostRange(sample.cost)).toBe('£1.60m – £1.99m')
    expect(coverCostRange({ total: { low: 42000, high: 52000 } })).toBe('£42,000 – £52,000')
  })
})

describe('titles', () => {
  it('uses Q1.0 on the cover and a short form in the running header', () => {
    expect(coverTitle(sample.answers)).toBe('Refurbishment — Hargreaves Teaching Block, Example University, Birmingham')
    expect(coverTitleSize(coverTitle(sample.answers))).toBe('long')
    expect(shortTitle(sample.answers)).toBe('Hargreaves Teaching Block, Example…')
  })
  it('builds the subtitle from answers: region and district, use, GIFA', () => {
    expect(coverSubtitle(sample.answers, sample.cost)).toBe('West Midlands, B15 · Education · 1,200 m² GIFA')
  })
  it('flags a title that is only a town or too short', () => {
    expect(titleLooksThin('Solihull', 'B91 1SF')).toBe(true)
    expect(titleLooksThin('B91 1SF', 'B91 1SF')).toBe(true)
    expect(titleLooksThin('Refurbishment of Block C, first floor', 'B15')).toBe(false)
  })
})

describe('clean text', () => {
  it('removes questionnaire numbers from report text', () => {
    expect(cleanReportText('Restricted working hours (Q3.5) extend construction.')).toBe('Restricted working hours extend construction.')
    expect(cleanReportText('Q3.6 = Partially occupied')).toBe('Partially occupied')
    expect(cleanReportText('divide by the Q2.3 band factor')).toBe('divide by the band factor')
  })
})

describe('small formats', () => {
  it('formats month-year, confidence and reference', () => {
    expect(fmtMonthYear('2027-08-23')).toBe('Aug 27')
    expect(confidenceWord('Moderate Confidence')).toBe('Moderate')
    expect(reportReference('a1b2c3d4e5f60718', {})).toBe('A1B2C3D4')
    expect(reportReference(null, { sample: true })).toBe('SAMPLE')
  })
  it('computes ROI from the estimate mid-point', () => {
    expect(calcRoi(sample.answers, sample.cost)).toEqual({
      annual: 95000, mid: 1798000, paybackYears: 18.9,
      benefits: ['Energy or operational cost savings', 'Grant or funding unlock'],
    })
  })
})

describe('calcRoi — when a Financial Case exists', () => {
  // Asymmetric grade-C range: the mid is not the average of low and high.
  const cost = { total: { low: 800_000, mid: 1_000_000, high: 1_250_000 } }
  it('uses the estimate mid, not the average of the range ends (NB-3, OM-1, RF-2)', () => {
    expect(calcRoi({ q5_2_annualBenefit: '100000' }, cost)).toMatchObject({ mid: 1_000_000, paybackYears: 10 })
  })
  it('exists for a named benefit with no annual figure, without a payback (EW-3, FO-3, OM-3, RF-3)', () => {
    expect(calcRoi({ q5_1_financialBenefit: ['Rental or commercial income'] }, cost))
      .toEqual({ annual: 0, mid: 1_000_000, benefits: ['Rental or commercial income'], paybackYears: null })
  })
  it('does not exist for "No direct financial return" alone, or with no answer', () => {
    expect(calcRoi({ q5_1_financialBenefit: ['No direct financial return — strategic or compliance project'] }, cost)).toBeNull()
    expect(calcRoi({}, cost)).toBeNull()
  })
  it('falls back to the range average for a record without a mid', () => {
    expect(calcRoi({ q5_2_annualBenefit: '50000' }, { total: { low: 900_000, high: 1_100_000 } })).toMatchObject({ mid: 1_000_000 })
  })
})
