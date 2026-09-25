import { describe, it, expect } from 'vitest'
import { BRAND, LOGOS, logoWidth, reportFileName, contactRows, contactLead } from '../brand.js'
import { BRAND as STYLE_BRAND } from '../reportStyle.js'

describe('brand', () => {
  it('holds the Projento strings in one place', () => {
    expect(BRAND.name).toBe('Projento')
    expect(BRAND.tagline).toBe('Plan · Analyse · Report')
    expect(BRAND.descriptor).toBe('Feasibility reporting for capital projects')
    expect(BRAND.siteUrl).toBeNull()
    expect(STYLE_BRAND).toBe(BRAND)
  })
  it('keeps the SVG aspect ratios the Word sizes rely on', () => {
    expect(logoWidth(LOGOS.wordmarkWhite, 35)).toBe(140)
    expect(logoWidth(LOGOS.lockup, 20)).toBe(82)
  })
  it('names downloads after the brand and the report reference', () => {
    expect(reportFileName('B6AABAF9', 'pdf')).toBe('Projento-Feasibility-Report-B6AABAF9.pdf')
    expect(reportFileName('', 'docx')).toBe('Projento-Feasibility-Report-DRAFT.docx')
  })
  it('prints the real contact email and no placeholder phone', () => {
    expect(BRAND.phone).toBeNull()
    expect(contactRows()).toEqual([['Email', 'info@projento.co.uk']])
    expect(contactLead()).toMatch(/contact our team/)
  })
  it('asks only for the reference when no contact details are set', () => {
    expect(contactRows({ email: null, phone: null, siteUrl: null })).toEqual([])
    expect(contactLead({ email: null, phone: null, siteUrl: null })).not.toMatch(/contact our team/)
  })
  it('lists only the contact details that are set, in a fixed order', () => {
    const b = { email: 'a@b.co', phone: null, siteUrl: 'projento.co.uk' }
    expect(contactRows(b)).toEqual([['Email', 'a@b.co'], ['Web', 'projento.co.uk']])
    expect(contactLead(b)).toMatch(/contact our team/)
  })
  it('never carries the old name or an AI label', () => {
    expect(JSON.stringify(BRAND)).not.toMatch(/estates|\bAI\b|smarter|insights/i)
  })
})
