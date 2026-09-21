import { describe, it, expect } from 'vitest'
import { isHigherRiskBuilding, SITE_CONTEXT_OPTIONS } from '../siteContext.js'

describe('siteContext — higher-risk derivation', () => {
  it('is true at 7 storeys with a residential use', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '7', q1_3_buildingUse: 'Residential',
    })).toBe(true)
  })

  it('is true under 7 storeys when the height answer says 18m or taller', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '6', q1_6_heightOver18m: 'Yes', q1_3_buildingUse: 'Healthcare',
    })).toBe(true)
  })

  // The use gate matters as much as the height: no residential units, not an HRB.
  it('is false for a ten-storey office', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '10', q1_6_heightOver18m: 'Yes', q1_3_buildingUse: 'Commercial offices',
    })).toBe(false)
  })

  it('is false when short and not tall enough', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '4', q1_6_heightOver18m: 'No', q1_3_buildingUse: 'Residential',
    })).toBe(false)
  })

  it('treats "Not sure" about height as not confirmed', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '5', q1_6_heightOver18m: 'Not sure', q1_3_buildingUse: 'Residential',
    })).toBe(false)
  })

  // Reports in KV live 90 days and were generated when this was a Q3.8 tick.
  it('still honours a legacy Q3.8 tick', () => {
    expect(isHigherRiskBuilding({
      q3_8_siteContext: ['Higher-risk building — 7+ storeys or 18 m+, residential / care / hospital use'],
    })).toBe(true)
  })

  it('no longer offers higher-risk as a Q3.8 option', () => {
    expect(SITE_CONTEXT_OPTIONS.some(o => /higher-risk/i.test(o))).toBe(false)
    expect(SITE_CONTEXT_OPTIONS).toHaveLength(4)
  })

  // A1 — spec §7: "Not applicable to Demolition only or External works only.
  // The gateways govern building work."
  it('is false for a 7-storey residential Demolition only', () => {
    expect(isHigherRiskBuilding({
      q1_2_projectType: 'Demolition only', q1_2_storeys: '7', q1_3_buildingUse: 'Residential',
    })).toBe(false)
  })

  it('is false for a 7-storey residential External works only', () => {
    expect(isHigherRiskBuilding({
      q1_2_projectType: 'External works only', q1_2_storeys: '7', q1_3_buildingUse: 'Residential',
    })).toBe(false)
  })

  it('is still true for a 7-storey residential Refurbishment', () => {
    expect(isHigherRiskBuilding({
      q1_2_projectType: 'Refurbishment', q1_2_storeys: '7', q1_3_buildingUse: 'Residential',
    })).toBe(true)
  })

  // A2 — Q1.2a asks for the EXTENSION's own storeys on this type, not the
  // host building's, so the storeys>=7 arm must not apply to an Extension.
  it('is false for a 7-storey residential Extension with no Q1.6 answer', () => {
    expect(isHigherRiskBuilding({
      q1_2_projectType: 'Extension', q1_2_storeys: '7', q1_3_buildingUse: 'Residential',
    })).toBe(false)
  })

  it('is true for a residential Extension when Q1.6 (completed building) says Yes, regardless of the extension\'s own storeys', () => {
    expect(isHigherRiskBuilding({
      q1_2_projectType: 'Extension', q1_2_storeys: '2', q1_6_heightOver18m: 'Yes', q1_3_buildingUse: 'Residential',
    })).toBe(true)
  })
})
