import { describe, it, expect } from 'vitest'
import { COLOURS, TYPE, TABLES, PAGE, BRAND, ptToPx, hp, pxToDxa, widthsToDxa, hex, cssVariables } from '../reportStyle.js'

describe('reportStyle', () => {
  it('holds six body text sizes, in points', () => {
    expect(Object.keys(TYPE)).toEqual(['sectionTitle', 'subHeading', 'body', 'table', 'small', 'statFigure'])
    expect(TYPE.body).toBe(10)
  })
  it('converts units for screen and Word', () => {
    expect(ptToPx(12)).toBe(16)
    expect(hp(9.5)).toBe(19)
    expect(pxToDxa(794)).toBe(11910)
  })
  it('splits a table width into DXA columns that sum exactly', () => {
    const w = widthsToDxa([0.09, 0.43, 0.12, 0.12, 0.12, 0.12], 10230)
    expect(w.reduce((a, b) => a + b, 0)).toBe(10230)
  })
  it('has every table recipe summing to 1', () => {
    for (const [name, fr] of Object.entries(TABLES)) {
      expect(Math.round(fr.reduce((a, b) => a + b, 0) * 1000) / 1000, name).toBe(1)
    }
  })
  it('exposes colours and sizes as CSS variables for the HTML renderer', () => {
    const v = cssVariables()
    expect(v['--r-navy']).toBe(COLOURS.navy)
    expect(v['--r-fs-body']).toBe(`${ptToPx(TYPE.body)}px`)
    expect(v['--r-cv-title-long']).toBeDefined()
    expect(hex('#1A2E4A')).toBe('1A2E4A')
  })
  it('keeps the placeholder brand in one place', () => {
    expect(BRAND.name).toBe('Estates AI')
    expect(PAGE.widthPx).toBe(794)
  })
})
