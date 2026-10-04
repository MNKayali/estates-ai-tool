// The admin System health panel prints each workbook's version from
// /api/rates-check, so the route must report all three.
import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/rates-check/route'

describe('/api/rates-check', () => {
  it('reports the version of each data workbook', async () => {
    const body = await (await GET()).json()
    expect(body.ratesOk && body.programmeOk && body.procurementOk).toBe(true)
    expect(body.workbook.version).toMatch(/^NRM1 v5\.\d+/)
    expect(body.programmeVersion).toMatch(/^Programme v4\.\d+/)
    expect(body.procurement.version).toMatch(/^Procurement Reference v\d/)
  })
})
