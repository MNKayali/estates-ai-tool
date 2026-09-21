import { describe, it, expect } from 'vitest'
import {
  PROJECT_TYPES, PROJECT_TYPE_VALUES, VISIBLE_GROUPS,
  rateFamilyFor, usesRateFallback, priceableFor,
} from '../projectTypes.js'

describe('projectTypes — the option list', () => {
  it('offers exactly the seven agreed types, in order', () => {
    expect(PROJECT_TYPE_VALUES).toEqual([
      'New Build', 'Extension', 'Refurbishment', 'Fit-out',
      'External works only', 'Demolition only', 'Other or mixed',
    ])
  })

  it('no longer offers the two removed types', () => {
    expect(PROJECT_TYPE_VALUES).not.toContain('Renewable Energy')
    expect(PROJECT_TYPE_VALUES).not.toContain('Mixed')
  })

  it('gives every option a help line', () => {
    for (const t of PROJECT_TYPES) {
      expect(typeof t.help).toBe('string')
      expect(t.help.length).toBeGreaterThan(10)
    }
  })

  it('has a visible-groups entry for every option', () => {
    for (const v of PROJECT_TYPE_VALUES) {
      expect(Array.isArray(VISIBLE_GROUPS[v])).toBe(true)
    }
  })

  it('keeps Fit-out to the three non-fabric groups', () => {
    expect(VISIBLE_GROUPS['Fit-out']).toEqual([3, 4, 5])
  })
})

describe('projectTypes — rate family', () => {
  it('maps each type to its family', () => {
    expect(rateFamilyFor('New Build')).toBe('newBuild')
    expect(rateFamilyFor('Extension')).toBe('extension')
    expect(rateFamilyFor('External works only')).toBe('externalWorks')
    expect(rateFamilyFor('Refurbishment')).toBe('refurb')
    expect(rateFamilyFor('Fit-out')).toBe('refurb')
    expect(rateFamilyFor('Demolition only')).toBe('refurb')
    expect(rateFamilyFor('Other or mixed')).toBe('refurb')
  })

  // Reports in KV live for 90 days and may hold a retired value.
  it('still resolves retired values stored in old reports', () => {
    expect(rateFamilyFor('Mixed')).toBe('refurb')
    expect(rateFamilyFor('Renewable Energy')).toBe('refurb')
    expect(rateFamilyFor('External Works')).toBe('externalWorks')
    expect(rateFamilyFor('Demolition')).toBe('refurb')
  })

  it('enables the fallback for Other or mixed only', () => {
    expect(usesRateFallback('Other or mixed')).toBe(true)
    expect(usesRateFallback('Refurbishment')).toBe(false)
    expect(usesRateFallback('Fit-out')).toBe(false)
    expect(usesRateFallback('New Build')).toBe(false)
    // The retired value an old report may still hold.
    expect(usesRateFallback('Mixed')).toBe(true)
  })
})

describe('projectTypes — priceableFor', () => {
  const item = code => ({
    code,
    priceable: { refurb: false, newBuild: true, extension: false, externalWorks: false },
  })

  it('hides a new-build-only element on a refurbishment', () => {
    expect(priceableFor(item('1.1'), 'Refurbishment')).toBe(false)
  })

  it('shows a new-build-only element on Other or mixed, via the fallback', () => {
    expect(priceableFor(item('1.1'), 'Other or mixed')).toBe(true)
  })

  it('treats a payload with no priceable flags as unfiltered', () => {
    expect(priceableFor({ code: '1.1' }, 'New Build')).toBe(true)
  })
})
