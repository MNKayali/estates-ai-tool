import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
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
  it('computes ROI from the published range', () => {
    expect(calcRoi(sample.answers, sample.cost)).toEqual({ annual: 95000, mid: 1797000, paybackYears: 18.9 })
  })
})
