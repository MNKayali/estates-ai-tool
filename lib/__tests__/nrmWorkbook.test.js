import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as XLSX from 'xlsx'
import {
  modelFromBytes, buildModel, loadNrmWorkbook, workbookStatus, WorkbookRejectedError,
  _resetWorkbookCache, _expireWorkbookCache,
} from '../nrmWorkbook.js'

// "Check before use": a new workbook is loaded only if the required headers are
// present, formula cells have values and every self-check on '1. Instructions'
// reads 0. Otherwise the last good version stays in use and the admin is told.
// The committed workbook (vitest.setup.mjs points RATES_FILE_URL at it;
// RATES_FILE_URL_TEST overrides). v5.4 kept prices and rules on one sheet; the
// fixture keeps that layout under test while it is still accepted.
const FILE = process.env.RATES_FILE_URL
const ONE_SHEET_V54 = 'lib/__tests__/fixtures/NRM1_v5_4_one_sheet_layout.xlsx'
const bytes = () => new Uint8Array(fs.readFileSync(FILE))

// Mutate the real workbook in memory and write it back out, so each test
// breaks exactly one thing about an otherwise-valid file.
function mutated(fn) {
  const wb = XLSX.read(bytes(), { type: 'array', cellFormula: true })
  fn(wb)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
const cellWhere = (ws, test) => Object.keys(ws).find(a => a[0] !== '!' && test(ws[a], a))

describe('nrmWorkbook — the workbook as committed', () => {
  it('loads with no problems and stamps its version', () => {
    const m = modelFromBytes(bytes())
    expect(m.versionLabel).toMatch(/^NRM1 v5\.7/)
    expect(m.settings.rangeWidths).toMatchObject({ A: { low: 0.9, high: 1.1 }, D: { low: 0.75, high: 1.3 } })
    // 81 items (v5.6 removed Bin store, v5.7 Cleanroom) and 132 priced rows
    // (v5.5 folded Service diversions' bands into one rate; v5.6 removed bathroom
    // pods, the bin store bands and the toilets' HOS / HEA rates). Rows that
    // price the same option for another building use (Bathrooms · Standard for
    // HOS) fold into it.
    expect(m.items.length).toBe(81)
    const rows = m.items.reduce((n, it) => n + it.options.reduce((k, o) => k + o.rows.length, 0), 0)
    expect(rows).toBe(132)
    // Removed items' old v4.5 codes are retired, so old drafts drop them cleanly.
    expect(m.settings.retiredCodes.map(r => r.code)).toEqual(expect.arrayContaining(['8.12', '4.44', '6.4']))
    expect(m.items.some(i => i.id === 'S-0038')).toBe(false)
  })

  it('prices prelims and OH&P at the v5.7 market levels', () => {
    const rules = modelFromBytes(bytes()).settings.percentageRules
    const a = rules.filter(r => r.code === 'A')
    expect(a.find(r => r.type === 'BASE')).toMatchObject({ adjustPct: 12, capPct: 20 })
    expect(a.filter(r => r.type === 'ADD').map(r => r.adjustPct)).toEqual([4, 2, 1, 1, 1])
    expect(rules.filter(r => r.code === 'B').map(r => r.adjustPct)).toEqual([7, 6, 5])
  })

  it('a heat pump at High spec costs the same on a refurbishment as on a new build', () => {
    const heat = modelFromBytes(bytes()).items.find(i => i.id === 'S-0039')
    for (const key of ['S-0039-02', 'S-0039-03']) {
      const { rates } = heat.options.flatMap(o => o.rows).find(r => r.key === key)
      expect(rates['Refurb & Fit-out High']).toBe(rates['New build & Extension High'])
    }
  })

  it('every option carries its own description, so the picker can say what a size band means', () => {
    const m = modelFromBytes(bytes())
    const supply = m.items.find(i => i.name === 'Electricity supply upgrade')
    const medium = supply.options.find(o => /Medium/.test(o.label))
    expect(medium.included).toMatch(/^Medium:/)
    expect(medium.included).not.toBe(supply.options.find(o => /Small/.test(o.label)).included)
  })

  it('reads columns by header text, not position', () => {
    const rateOf = m => m.items.find(i => i.name === 'Wall finishes').options[0].rows[0].rates
    const before = rateOf(modelFromBytes(bytes()))
    // Swap the two headers (not the data): if columns were read by position the
    // rates would not move; read by header, Basic and High trade places.
    const after = rateOf(modelFromBytes(mutated(wb => {
      const ws = wb.Sheets['2. Rates']
      const a = cellWhere(ws, c => c.v === 'Refurb & Fit-out Basic')
      const b = cellWhere(ws, c => c.v === 'Refurb & Fit-out High')
      ws[a].v = 'Refurb & Fit-out High'; ws[a].w = 'Refurb & Fit-out High'
      ws[b].v = 'Refurb & Fit-out Basic'; ws[b].w = 'Refurb & Fit-out Basic'
    })))
    expect(after['Refurb & Fit-out Basic']).toBe(before['Refurb & Fit-out High'])
    expect(after['Refurb & Fit-out High']).toBe(before['Refurb & Fit-out Basic'])
    // A column the app does not read can be renamed freely.
    expect(() => modelFromBytes(mutated(wb => {
      const ws = wb.Sheets['2. Rates']
      const a = cellWhere(ws, c => /^Spon's check/.test(String(c.v)))
      ws[a].v = 'Comments'; ws[a].w = 'Comments'
    }))).not.toThrow()
  })

  it('a blank Basic or High on 2. Rates reads the Standard rate; a 0 Standard stays 0 (not offered)', () => {
    const m = modelFromBytes(bytes())
    const row = key => m.items.flatMap(i => i.options).flatMap(o => o.rows).find(r => r.key === key)
    // Asbestos: one rate for every specification level (Basic and High blank).
    expect(row('S-0001-01').rates).toMatchObject({ 'Refurb & Fit-out Basic': 25, 'Refurb & Fit-out Std': 25, 'Refurb & Fit-out High': 25, 'New build & Extension High': 25 })
    // Contaminated land: not offered on refurbishment-type projects.
    expect(row('S-0004-01').rates).toMatchObject({ 'Refurb & Fit-out Basic': 0, 'Refurb & Fit-out Std': 0, 'Refurb & Fit-out High': 0, 'New build & Extension Std': 60 })
  })

  it('still reads the v5.4 one-sheet layout, so a deploy and a workbook update need not land together', () => {
    const m = modelFromBytes(new Uint8Array(fs.readFileSync(ONE_SHEET_V54)))
    expect(m.versionLabel).toMatch(/^NRM1 v5\.4/)
    expect(m.items.length).toBe(83)
    expect(m.items.reduce((n, it) => n + it.options.reduce((k, o) => k + o.rows.length, 0), 0)).toBe(141)
  })
})

describe('nrmWorkbook — rejects a file that fails a check', () => {
  const expectRejected = (bytesIn, pattern) => {
    let err
    try { modelFromBytes(bytesIn) } catch (e) { err = e }
    expect(err).toBeInstanceOf(WorkbookRejectedError)
    expect(err.problems.join('\n')).toMatch(pattern)
  }

  it('a self-check that is not 0', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['1. Instructions']
      const row = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).findIndex(r => String(r[0]).startsWith('Duplicate rate keys'))
      ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = { t: 'n', v: 2 }
    }), /self-check "Duplicate rate keys[^"]*" reads 2/)
  })

  it('a missing column header', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['4. Scope rules']
      const a = cellWhere(ws, c => c.v === 'Quantity rule')
      ws[a].v = 'Qty rule'; ws[a].w = 'Qty rule'
    }), /missing the "Quantity rule" column/)
  })

  it('formula cells saved without values (a tool that does not recalculate)', () => {
    // Checked on the parsed workbook: SheetJS drops a value-less cell on write,
    // so this case can't round-trip through a file the way the others do.
    const wb = XLSX.read(bytes(), { type: 'array', cellFormula: true })
    const ws = wb.Sheets['2. Rates']
    const a = cellWhere(ws, c => !!c.f)
    delete ws[a].v; delete ws[a].w
    expect(buildModel(wb).problems.join('\n')).toMatch(/formula cell\(s\) saved without a value/)
  })

  it('a quantity rule using a name the app does not know', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['4. Scope rules']
      const a = cellWhere(ws, c => c.v === 'ROUND(GIFA / r.m2_per_person / r.persons_per_wc, 0)')
      ws[a].v = 'ROUND(HEADCOUNT / 20, 0)'; ws[a].w = ws[a].v
    }), /unknown name "HEADCOUNT"/)
  })

  it('a project type code that is not defined on Settings', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['4. Scope rules']
      const a = cellWhere(ws, c => c.v === 'NB EX RF FO EW DM OM')
      ws[a].v = 'NB EX RF FO EW DM OM ZZ'; ws[a].w = ws[a].v
    }), /"ZZ" is not a project type code/)
  })

  it('a price row on 2. Rates with no row on 4. Scope rules, and the reverse', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['4. Scope rules']
      const a = cellWhere(ws, c => c.v === 'S-0001-01')
      ws[a].v = 'S-0001-99'; ws[a].w = 'S-0001-99'
    }), /S-0001-01\): no row for this rate key[\s\S]*S-0001-99 has no row on /)
  })

  it('the v4.5 workbook, with a message saying so', () => {
    expectRejected(new Uint8Array(fs.readFileSync('NRM1_Cost_Estimate_Tool_v4_5.xlsx')), /looks like the v4\.5 workbook/)
  })
})

describe('nrmWorkbook — keeps the last good version', () => {
  const original = process.env.RATES_FILE_URL
  afterEach(() => { process.env.RATES_FILE_URL = original; _resetWorkbookCache() })

  it('serves the last good model when a newer file is rejected, and reports the rejection', async () => {
    _resetWorkbookCache()
    const good = await loadNrmWorkbook()
    expect(workbookStatus().rejectedUpdate).toBeNull()

    const bad = path.join(os.tmpdir(), `nrm-bad-${Date.now()}.xlsx`)
    fs.writeFileSync(bad, mutated(wb => {
      const ws = wb.Sheets['1. Instructions']
      const row = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).findIndex(r => String(r[0]).startsWith('Duplicate rate keys'))
      ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = { t: 'n', v: 1 }
    }))
    process.env.RATES_FILE_URL = bad
    _expireWorkbookCache()
    const served = await loadNrmWorkbook()
    expect(served).toBe(good)
    const status = workbookStatus()
    expect(status.version).toBe(good.versionLabel)
    expect(status.rejectedUpdate.problems[0]).toMatch(/Duplicate rate keys/)
    fs.unlinkSync(bad)
  })

  it('callers arriving on a cold cache share one read', async () => {
    // Regression: /api/scope-items asks for the catalogue and the regions at
    // once, and each used to download and parse the workbook on its own.
    _resetWorkbookCache()
    const [a, b] = await Promise.all([loadNrmWorkbook(), loadNrmWorkbook()])
    expect(a).toBe(b)
  })

  it('with no good version yet, the rejection propagates — there is no hard-coded fallback', async () => {
    _resetWorkbookCache()
    process.env.RATES_FILE_URL = 'NRM1_Cost_Estimate_Tool_v4_5.xlsx'
    await expect(loadNrmWorkbook()).rejects.toBeInstanceOf(WorkbookRejectedError)
  })
})
