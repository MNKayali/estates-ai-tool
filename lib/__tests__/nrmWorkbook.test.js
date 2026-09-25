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
const FILE = 'NRM1_Cost_Estimate_Tool_v5_2.xlsx'
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
    expect(m.versionLabel).toMatch(/^NRM1 v5\.4/)
    expect(m.settings.rangeWidths).toMatchObject({ A: { low: 0.9, high: 1.1 }, D: { low: 0.75, high: 1.3 } })
    expect(m.items.length).toBe(83)
    // 141 priced rows; rows that price the same option for another building
    // use (Toilets · Standard for HOS / HEA …) fold into that option.
    const rows = m.items.reduce((n, it) => n + it.options.reduce((k, o) => k + o.rows.length, 0), 0)
    expect(rows).toBe(141)
  })

  it('reads columns by header text, not position', () => {
    const rateOf = m => m.items.find(i => i.name === 'Wall finishes').options[0].rows[0].rates
    const before = rateOf(modelFromBytes(bytes()))
    // Swap the two headers (not the data): if columns were read by position the
    // rates would not move; read by header, Basic and High trade places.
    const after = rateOf(modelFromBytes(mutated(wb => {
      const ws = wb.Sheets['2. Scope and Rates']
      const a = cellWhere(ws, c => c.v === 'Rfb Basic')
      const b = cellWhere(ws, c => c.v === 'Rfb High')
      ws[a].v = 'Rfb High'; ws[a].w = 'Rfb High'
      ws[b].v = 'Rfb Basic'; ws[b].w = 'Rfb Basic'
    })))
    expect(after['Rfb Basic']).toBe(before['Rfb High'])
    expect(after['Rfb High']).toBe(before['Rfb Basic'])
    // A column the app does not read can be renamed freely.
    expect(() => modelFromBytes(mutated(wb => {
      const ws = wb.Sheets['2. Scope and Rates']
      const a = cellWhere(ws, c => c.v === 'Notes')
      ws[a].v = 'Comments'; ws[a].w = 'Comments'
    }))).not.toThrow()
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
      const row = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).findIndex(r => r[0] === 'Duplicate rate keys')
      ws[XLSX.utils.encode_cell({ r: row, c: 2 })] = { t: 'n', v: 2 }
    }), /self-check "Duplicate rate keys" reads 2/)
  })

  it('a missing column header', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['2. Scope and Rates']
      const a = cellWhere(ws, c => c.v === 'Quantity rule')
      ws[a].v = 'Qty rule'; ws[a].w = 'Qty rule'
    }), /missing the "Quantity rule" column/)
  })

  it('formula cells saved without values (a tool that does not recalculate)', () => {
    // Checked on the parsed workbook: SheetJS drops a value-less cell on write,
    // so this case can't round-trip through a file the way the others do.
    const wb = XLSX.read(bytes(), { type: 'array', cellFormula: true })
    const ws = wb.Sheets['2. Scope and Rates']
    const a = cellWhere(ws, c => !!c.f)
    delete ws[a].v; delete ws[a].w
    expect(buildModel(wb).problems.join('\n')).toMatch(/formula cell\(s\) saved without a value/)
  })

  it('a quantity rule using a name the app does not know', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['2. Scope and Rates']
      const a = cellWhere(ws, c => c.v === 'ROUND(GIFA / r.m2_per_person / r.persons_per_wc, 0)')
      ws[a].v = 'ROUND(HEADCOUNT / 20, 0)'; ws[a].w = ws[a].v
    }), /unknown name "HEADCOUNT"/)
  })

  it('a project type code that is not defined on Settings', () => {
    expectRejected(mutated(wb => {
      const ws = wb.Sheets['2. Scope and Rates']
      const a = cellWhere(ws, c => c.v === 'NB EX RF FO EW DM OM')
      ws[a].v = 'NB EX RF FO EW DM OM ZZ'; ws[a].w = ws[a].v
    }), /"ZZ" is not a project type code/)
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
      const row = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).findIndex(r => r[0] === 'Duplicate rate keys')
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

  it('with no good version yet, the rejection propagates — there is no hard-coded fallback', async () => {
    _resetWorkbookCache()
    process.env.RATES_FILE_URL = 'NRM1_Cost_Estimate_Tool_v4_5.xlsx'
    await expect(loadNrmWorkbook()).rejects.toBeInstanceOf(WorkbookRejectedError)
  })
})
