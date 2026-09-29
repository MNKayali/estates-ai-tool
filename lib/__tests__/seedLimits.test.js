import { describe, it, expect } from 'vitest'
import { FIXED_SEEDS, WARNING_SEED_MITIGATIONS } from '../prose.js'
import { PROSE_LIMITS } from '../proseSchema.js'

// The model is told to include every seed as written. A seed longer than the
// register's own limits therefore failed the shape check on every report that
// raised it (a retry each time, then an over-long row kept) — the sample
// report carried three such rows. Fixed seed wording must fit the limits.
const words = s => String(s).trim().split(/\s+/).length
const { description: [, maxDesc], mitigation: [, maxMit] } = PROSE_LIMITS.riskRegister.fields

describe('fixed risk seeds fit the register limits', () => {
  it.each(FIXED_SEEDS.map(s => [s.ref, s]))('%s', (_ref, s) => {
    expect(words(s.description)).toBeLessThanOrEqual(maxDesc)
    expect(words(s.mitigation)).toBeLessThanOrEqual(maxMit)
  })

  it.each(Object.entries(WARNING_SEED_MITIGATIONS))('warning seed %s mitigation', (_code, m) => {
    expect(words(m)).toBeLessThanOrEqual(maxMit)
  })

})
