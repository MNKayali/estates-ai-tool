/**
 * GET /api/rates-check
 * Health check — confirms NRM1 v5.2 and Programme v4.3 data files load correctly.
 *
 * Gated behind the access code in proxy.ts. It reports real sample values (a rate
 * and a duration) on purpose: that is what proves the sheets actually PARSED,
 * not merely that the files downloaded — see CLAUDE.md "Health check".
 *
 * The NRM1 side goes through lib/nrmWorkbook.js's checked, cached loader, so it
 * also reports what the admin needs to know about the workbook in use: its
 * version, any newer upload that was REJECTED (and why — the last good version
 * stays live), and the data gaps the engine works around rather than hides
 * (items shown on a project type with no rate for it, project types with no
 * pre-ticked items, optional tables not yet added).
 *
 * Both workbooks are read through the calculators' own 10-minute in-module
 * caches rather than a private uncached fetch, so repeated checks can't get the
 * deployment rate-limited by the workbook host.
 */
import * as XLSX from 'xlsx'
import { loadNrmWorkbook, workbookStatus, columnsFor } from '@/lib/nrmWorkbook'
import { fetchProgrammeWorkbook } from '@/lib/programmeCalculator'

const PROGRAMME_SIZE_BANDS = ['S1 (<150)', 'S2 (≤250)', 'S3 (≤500)', 'S4 (≤1500)', 'S5 (≤3000)', 'S6 (>3000)']
// One representative line whose rate proves '2. Scope and Rates' parsed.
const SAMPLE_ITEM = 'Wall finishes'

function parseDurationsTab(wb) {
  const ws = wb.Sheets['Durations']
  if (!ws) return null
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!id || id.length > 20) continue
    table[id] = {
      activity: String(r[2] || '').trim(),
      S3: { lo: Number(r[7]) || 0, hi: Number(r[8]) || 0 },
    }
  }
  return table
}

export async function GET() {
  const result = {
    ratesOk:    false,
    programmeOk: false,
    templateOk:  true,
    workbook: null,               // version in use, loadedAt, rejectedUpdate, lastError
    itemCount: 0,
    optionCount: 0,
    sampleRate: null,             // { item, rateKey, column, rate }
    programmeSizeBands:   PROGRAMME_SIZE_BANDS,
    sampleDuration_DS2_S3_mid: null,
    // Data the engine works around rather than inventing numbers for.
    gaps: {
      shownWithoutRate: [],       // items 'Shown on' a project type with no rate in its columns
      noTypicalScope: [],         // project types no item is 'Pre-ticked on' (and that don't use level of intervention)
      rangeWidthsTable: false,    // '3. Settings' ▶ range_widths (optional; legacy ±11% applies without it)
      baseDate: null,             // v5.2 has no rate base date; reports say "the workbook issue date"
    },
    procurementSheet: false,      // Programme sheet "Procurement"
    newDurationRows: { SV7: false, BS1: false },
    fetchedAt: new Date().toISOString(),
    errors: [],
  }

  // ── NRM1 v5.2 ─────────────────────────────────────────────────────────────
  try {
    const model = await loadNrmWorkbook()
    const s = model.settings
    result.ratesOk = model.items.length > 0
    result.itemCount = model.items.length
    result.optionCount = model.items.reduce((n, it) => n + it.options.length, 0)
    const sample = model.items.find(it => it.name === SAMPLE_ITEM)
    if (sample) {
      const [col] = columnsFor(s, 'RF', 'Standard')
      const row = sample.options[0].rows[0]
      result.sampleRate = { item: sample.name, rateKey: row.key, column: col, rate: row.rates[col] }
    }
    for (const it of model.items.filter(i => !i.auto)) {
      for (const pt of it.shownOn) {
        if (!it.options.some(o => o.priceableFor?.[pt])) {
          const cols = [...new Set(columnsFor(s, pt).flat())]
          result.gaps.shownWithoutRate.push(`${it.id} ${it.name} — ${pt} (${cols.join(' / ')})`)
        }
      }
    }
    for (const p of s.projectTypes) {
      if (!p.usesLevel && !model.items.some(it => it.preOn.includes(p.code))) result.gaps.noTypicalScope.push(`${p.code} ${p.label}`)
    }
    result.gaps.rangeWidthsTable = !!s.rangeWidths
  } catch (e) {
    result.errors.push('NRM1 workbook: ' + e.message)
    if (e.problems) result.errors.push(...e.problems.slice(0, 25).map(p => '  · ' + p))
  }
  result.workbook = workbookStatus()
  if (result.workbook.rejectedUpdate) {
    result.errors.push(`A newer NRM1 workbook was rejected at ${result.workbook.rejectedUpdate.at}; still using ${result.workbook.version}. First problem: ${result.workbook.rejectedUpdate.problems[0]}`)
  }
  // ── Check Programme v4.3 workbook ─────────────────────────────────────────
  try {
    const wb = await fetchProgrammeWorkbook()
    const sheetNames = wb.SheetNames
    const hasDurationsTab = sheetNames.includes('Durations')
    const hasModifiersTab = sheetNames.includes('Modifiers')

    if (!hasDurationsTab) {
      result.errors.push(`Programme workbook missing "Durations" sheet. Sheets found: ${sheetNames.join(', ')}`)
    } else if (!hasModifiersTab) {
      result.errors.push(`Programme workbook missing "Modifiers" sheet. Sheets found: ${sheetNames.join(', ')}`)
    } else {
      const durTab = parseDurationsTab(wb)
      result.procurementSheet = sheetNames.includes('Procurement')
      result.newDurationRows = { SV7: !!durTab?.['SV7'], BS1: !!durTab?.['BS1'] }
      const ds2 = durTab?.['DS2']
      if (ds2 && ds2.activity && (ds2.S3.lo || ds2.S3.hi)) {
        result.programmeOk = true
        result.sampleDuration_DS2_S3_mid = (ds2.S3.lo + ds2.S3.hi) / 2
      } else {
        result.errors.push('Programme Durations sheet parsed but DS2 (Stage 2 Concept Design) S3 band is empty or missing')
      }
    }
  } catch (e) {
    result.errors.push('Programme workbook: ' + e.message)
  }

  const httpStatus = (result.ratesOk && result.programmeOk) ? 200 : 503

  return Response.json(result, { status: httpStatus })
}
