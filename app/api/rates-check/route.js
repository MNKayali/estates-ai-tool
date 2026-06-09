/**
 * GET /api/rates-check
 * Health check — confirms NRM1 v4.5 and Programme v4.3 data files load correctly.
 */
import * as XLSX from 'xlsx'

// Representative v4.5 codes (incl. building-use-specific rows) that must exist.
const NEW_ELEMENTS = ['4.2-RES', '4.10', '4.14', '5.27', '8.10']
const PROGRAMME_SIZE_BANDS = ['S1 (<150)', 'S2 (≤250)', 'S3 (≤500)', 'S4 (≤1500)', 'S5 (≤3000)', 'S6 (>3000)']

async function loadWorkbook(url, label) {
  if (!url) throw new Error(`${label} URL not set in environment`)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  return XLSX.read(new Uint8Array(buf), { type: 'array' })
}

// v4.5 "2. Master Cost Table": code col0, building use col3, unit col5,
// pricing type col6, Rfb Std col10. Group banner rows (Code "GROUP …") skipped.
function parseRatesTab(wb) {
  const ws = wb.Sheets['2. Master Cost Table']
  if (!ws) return {}
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const elements = {}
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i]
    const code = String(r[0] || '').trim()
    if (!code || /^GROUP/i.test(code)) continue
    elements[code] = {
      buildingUse: String(r[3] || '').trim(),
      unit: String(r[5] || '').trim(),
      pricingType: String(r[6] || '').trim(),
      rfbStd: Number(r[10]) || 0,
    }
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
    elementCount: 0,
    sampleRate_3_1_unit:    null,
    sampleRate_3_1_rfbStd:  null,
    sampleRate_4_2RES_buildingUse: null,
    sampleRate_4_2RES_rfbStd:      null,
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
      result.elementCount = elementCount

      for (const code of NEW_ELEMENTS) {
        result.newElementsPresent[code] = code in elements
      }

      if (elements['3.1']) {
        result.sampleRate_3_1_unit   = elements['3.1'].unit
        result.sampleRate_3_1_rfbStd = elements['3.1'].rfbStd
      }
      if (elements['4.2-RES']) {
        result.sampleRate_4_2RES_buildingUse = elements['4.2-RES'].buildingUse
        result.sampleRate_4_2RES_rfbStd      = elements['4.2-RES'].rfbStd
      }

      const missing = NEW_ELEMENTS.filter(c => !elements[c])
      if (missing.length > 0) {
        result.errors.push(`Missing elements in NRM1 v4.5: ${missing.join(', ')}`)
      }
    } else {
      result.errors.push('NRM1 workbook loaded but no elements parsed from "2. Master Cost Table"')
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
