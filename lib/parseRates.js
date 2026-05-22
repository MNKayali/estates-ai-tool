// lib/parseRates.js
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'

let cachedRates = null
let cacheTime = null
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes
const RATES_FILENAME = 'NRM1_Cost_Estimate_Tool_v2.xlsx'
const SPREAD = 0.11 // ±11% each side = 22% total Low-to-High spread

// ── Load workbook ────────────────────────────────────────────────────────────
export async function getRates() {
  if (cachedRates && cacheTime && Date.now() - cacheTime < CACHE_DURATION) {
    console.log('[rates] Serving from cache')
    return cachedRates
  }

  let buffer

  // Primary: read directly from filesystem — file is committed to git so it
  // is present in the Vercel serverless function bundle
  const fsPath = path.join(process.cwd(), RATES_FILENAME)
  console.log('[rates] Trying filesystem:', fsPath)
  try {
    buffer = fs.readFileSync(fsPath)
    console.log('[rates] ✅ Loaded from filesystem, bytes:', buffer.length)
  } catch (fsErr) {
    console.log('[rates] Filesystem failed:', fsErr.message)

    // Fallback: fetch from URL (requires RATES_FILE_URL to be set)
    const url = process.env.RATES_FILE_URL
    if (!url) {
      throw new Error(
        `Cannot load rates: filesystem read failed (${fsErr.message}) and RATES_FILE_URL is not set. ` +
        `Tried path: ${fsPath}`
      )
    }
    console.log('[rates] Trying URL:', url)
    const res = await fetch(url, { cache: 'no-store' })
    console.log('[rates] HTTP status:', res.status)
    if (!res.ok) {
      throw new Error(
        `Rates HTTP fetch failed with status ${res.status}. URL tried: ${url}`
      )
    }
    buffer = Buffer.from(await res.arrayBuffer())
    console.log('[rates] ✅ Loaded from URL, bytes:', buffer.length)
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' })
  console.log('[rates] Sheet names:', workbook.SheetNames)

  const rates = {}
  workbook.SheetNames.forEach(name => {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
    rates[name] = data
    console.log(`[rates] Sheet "${name}": ${data.length} rows`)
    if (data.length > 0) {
      console.log(`[rates] Sheet "${name}" row 0:`, JSON.stringify(data[0]).slice(0, 120))
    }
    if (data.length > 4) {
      console.log(`[rates] Sheet "${name}" row 4:`, JSON.stringify(data[4]).slice(0, 120))
    }
  })

  cachedRates = rates
  cacheTime = Date.now()
  return rates
}

// ── BCIS regional factor ──────────────────────────────────────────────────────
export function getBcisFactorForRegion(postcodeOrRegion) {
  if (!postcodeOrRegion) return 0.94
  const input = postcodeOrRegion.toString().toUpperCase().trim()

  const postcodeFactors = {
    // Inner London
    EC: 1.25, WC: 1.25, E1: 1.22, N1: 1.22, SE1: 1.22, SW1: 1.25, W1: 1.25,
    // Outer London
    BR: 1.15, CR: 1.15, DA: 1.15, EN: 1.15, HA: 1.15, IG: 1.15, KT: 1.15,
    RM: 1.15, SM: 1.15, TW: 1.15, UB: 1.15, WD: 1.15,
    // South East
    BN: 1.08, GU: 1.08, ME: 1.05, OX: 1.08, PO: 1.05, RG: 1.08, RH: 1.08,
    SL: 1.08, SO: 1.05, TN: 1.05,
    // East of England
    AL: 1.02, CB: 1.02, CM: 1.02, CO: 1.00, IP: 1.00, LU: 1.02, MK: 1.00,
    NR: 1.00, PE: 1.00, SG: 1.02, SS: 1.02,
    // West Midlands
    B: 0.94, CV: 0.94, DY: 0.93, ST: 0.93, TF: 0.93, WR: 0.93, WS: 0.93, WV: 0.93,
    // East Midlands
    DE: 0.93, LE: 0.93, LN: 0.92, NG: 0.93, NN: 0.93,
    // Yorkshire
    BD: 0.90, DN: 0.89, HD: 0.90, HG: 0.90, HU: 0.89, HX: 0.90, LS: 0.91,
    S: 0.90, WF: 0.90, YO: 0.90,
    // North West
    BB: 0.92, BL: 0.92, CH: 0.92, CW: 0.92, FY: 0.91, L: 0.93, LA: 0.91,
    M: 0.93, OL: 0.92, PR: 0.92, SK: 0.92, WA: 0.92, WN: 0.92,
    // North East
    DH: 0.89, DL: 0.89, NE: 0.89, SR: 0.88, TS: 0.89,
    // Wales
    CF: 0.90, LD: 0.88, LL: 0.88, NP: 0.90, SA: 0.88, SY: 0.88,
    // Scotland
    AB: 0.96, DD: 0.94, EH: 0.96, FK: 0.94, G: 0.97, IV: 0.94, KA: 0.94,
    KY: 0.94, ML: 0.94, PA: 0.94, PH: 0.94,
    // Northern Ireland
    BT: 0.85,
  }

  const area = input.match(/^[A-Z]+/)?.[0] || ''
  return postcodeFactors[area] || postcodeFactors[area[0]] || 0.94
}

// ── Map project type + spec level to Rates Reference Table column ────────────
//
// Rates Reference Table columns (index):
//   4: Rfb Basic  |  5: Rfb Standard  |  6: Rfb High Spec
//   7: NB Standard  |  8: NB High Spec
//   9: Extension Standard  |  10: Extension High Spec
//   11: External Works Only
function getRateColumnIndex(projectType, specLevel) {
  const pt = (projectType || '').toLowerCase()
  const sl = (specLevel || '').toLowerCase()
  const isHigh = sl.includes('high') || sl.includes('specialist') || sl.includes('prestige') || sl.includes('enhanced')
  const isBasic = sl.includes('basic') || sl.includes('budget')

  if (pt.includes('newbuild') || pt.includes('new build') || pt.includes('new_build')) {
    return isHigh ? 8 : 7
  }
  if (pt.includes('extension')) {
    return isHigh ? 10 : 9
  }
  if (pt.includes('external')) return 11

  // Default: refurb / fit-out
  if (isHigh) return 6
  if (isBasic) return 4
  return 5 // standard
}

// ── Resolve spec level string from questionnaire value ───────────────────────
export function resolveSpecLevel(rawSpecLevel) {
  if (!rawSpecLevel) return 'standard'
  const s = rawSpecLevel.toLowerCase()
  if (s.startsWith('budget')) return 'basic'
  if (s.startsWith('enhanced') || s.startsWith('prestige')) return 'high'
  return 'standard'
}

// ── Build the rates prompt for Layer 1 ───────────────────────────────────────
export function buildRatesPrompt(rates, projectType, specLevel, bcisFactor) {
  const refTable = rates['Rates Reference Table']
  if (!refTable || refTable.length < 5) {
    throw new Error('Rates Reference Table sheet not found or has fewer than 5 rows')
  }

  const colIdx = getRateColumnIndex(projectType, specLevel)
  const factor = typeof bcisFactor === 'number' ? bcisFactor : 0.94
  const resolvedSpec = specLevel || 'standard'

  const lines = [
    '=== NRM1 BENCHMARK RATES — MANDATORY — USE ONLY THESE RATES ===',
    `Source: NRM1_Cost_Estimate_Tool_v2.xlsx | Q2 2026 | Project: ${projectType} | Spec: ${resolvedSpec} | BCIS factor: ${factor}`,
    `Column selected: index ${colIdx} | Spread applied: ±${SPREAD*100}% (Low = mid×${1-SPREAD}, High = mid×${1+SPREAD})`,
    `Note: BCIS regional factor ALREADY applied to Low/High values. Do NOT re-apply it.`,
    '',
    'NRM1 CODE | ELEMENT / DESCRIPTION                          | LOW £/m² | HIGH £/m² | NOTES',
    '─'.repeat(110),
  ]

  let currentGroup = ''
  refTable.forEach(row => {
    if (!row || row.length === 0) return

    // Group header row (single long string starting with GROUP)
    if (row.length === 1 && typeof row[0] === 'string' && row[0].includes('GROUP')) {
      // Extract just the group number and name, trim the instruction part after —
      const groupStr = row[0].split('  —  ').slice(0, 2).join(' — ')
      lines.push('')
      lines.push('[ ' + groupStr.trim() + ' ]')
      currentGroup = row[0]
      return
    }

    // Data row: col 0 = group number (string like "0","1",...), col 1 = sub-code, col 2 = element
    const grp     = row[0]
    const sub     = row[1]
    const element = row[2]
    const mid     = row[colIdx]
    const notes   = row[12] || ''

    if (
      typeof grp === 'string' &&
      grp.trim() !== '' &&
      !isNaN(grp) &&
      element &&
      typeof mid === 'number' &&
      mid > 0
    ) {
      const adjMid = mid * factor
      const low    = Math.round(adjMid * (1 - SPREAD) * 10) / 10
      const high   = Math.round(adjMid * (1 + SPREAD) * 10) / 10
      const code   = (sub || grp).toString().trim()
      const desc   = element.toString().trim().padEnd(48)
      lines.push(`${code.padEnd(9)} | ${desc} | £${low.toString().padStart(7)} | £${high.toString().padStart(8)} | ${notes}`)
    }
  })

  lines.push('')
  lines.push('─'.repeat(110))
  lines.push('INSTRUCTION: Use ONLY the LOW and HIGH values from the table above for every NRM1 element you include.')
  lines.push('Do NOT use your training-data estimates or general BCIS knowledge for any individual rate.')
  lines.push('Match each scope item to its NRM1 code in this table. If an element has no entry (rate = 0 or absent), exclude it and note the reason.')
  lines.push('The BCIS regional factor is already embedded in these figures — do NOT multiply by it again.')
  lines.push('=== END RATES ===')

  return lines.join('\n')
}
