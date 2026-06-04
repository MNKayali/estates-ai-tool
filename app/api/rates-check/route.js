/**
 * GET /api/rates-check
 * Health check — confirms NRM1 v3.7 and Programme v4.3 data files load correctly.
 */
import * as XLSX from 'xlsx'

const NEW_ELEMENTS = ['5.2L', '5.7a', '5.8a', '5.8b', '5.8c', '5.9a', '5.9b']
const PROGRAMME_SIZE_BANDS = ['S1 (<150)', 'S2 (≤250)', 'S3 (≤500)', 'S4 (≤1500)', 'S5 (≤3000)', 'S6 (>3000)']

async function loadWorkbook(url, label) {
  if (!url) throw new Error(`${label} URL not set in environment`)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  return XLSX.read(new Uint8Array(buf), { type: 'array' })
}

function parseRatesTab(wb) {
  const ws = wb.Sheets['2. Rates Reference Table']
  if (!ws) return {}
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const elements = {}
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i]
    const sub = String(r[1] || '').trim()
    if (!sub || typeof r[0] !== 'number') continue
    elements[sub] = { unit: String(r[3] || '').trim(), rfbStd: Number(r[5]) || 0 }
  }
  return elements
}

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
    newElementsPresent: Object.fromEntries(NEW_ELEMENTS.map(c => [c, false])),
    sampleRate_4_2_unit:    null,
    sampleRate_4_2_rfbStd:  null,
    sampleRate_4_3_unit:    null,
    sampleRate_4_3_rfbStd:  null,
    programmeSizeBands:   PROGRAMME_SIZE_BANDS,
    sampleDuration_DS2_S3_mid: null,
    fetchedAt: new Date().toISOString(),
    errors: [],
  }

  // ── Check NRM1 v3.7 workbook ──────────────────────────────────────────────
  try {
    const wb = await loadWorkbook(process.env.RATES_FILE_URL, 'NRM1 workbook')
    const elements = parseRatesTab(wb)
    const elementCount = Object.keys(elements).length

    if (elementCount > 0) {
      result.ratesOk = true

      for (const code of NEW_ELEMENTS) {
        result.newElementsPresent[code] = code in elements
      }

      if (elements['4.2']) {
        result.sampleRate_4_2_unit   = elements['4.2'].unit
        result.sampleRate_4_2_rfbStd = elements['4.2'].rfbStd
      }
      if (elements['4.3']) {
        result.sampleRate_4_3_unit   = elements['4.3'].unit
        result.sampleRate_4_3_rfbStd = elements['4.3'].rfbStd
      }

      const missing = NEW_ELEMENTS.filter(c => !elements[c])
      if (missing.length > 0) {
        result.errors.push(`Missing elements in NRM1 v3.7: ${missing.join(', ')}`)
      }
    } else {
      result.errors.push('NRM1 workbook loaded but no elements parsed from Tab 2')
    }
  } catch (e) {
    result.errors.push('NRM1 workbook: ' + e.message)
  }

  // ── Check Programme v4.3 workbook ─────────────────────────────────────────
  try {
    const wb = await loadWorkbook(process.env.PROGRAMME_FILE_URL, 'Programme workbook')
    const sheetNames = wb.SheetNames
    const hasDurationsTab = sheetNames.includes('Durations')
    const hasModifiersTab = sheetNames.includes('Modifiers')

    if (!hasDurationsTab) {
      result.errors.push(`Programme workbook missing "Durations" sheet. Sheets found: ${sheetNames.join(', ')}`)
    } else if (!hasModifiersTab) {
      result.errors.push(`Programme workbook missing "Modifiers" sheet. Sheets found: ${sheetNames.join(', ')}`)
    } else {
      const durTab = parseDurationsTab(wb)
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

  const allNewPresent = NEW_ELEMENTS.every(c => result.newElementsPresent[c])
  const httpStatus = (result.ratesOk && result.programmeOk && allNewPresent) ? 200 : 503

  return Response.json(result, { status: httpStatus })
}
