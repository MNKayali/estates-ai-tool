// lib/parseRates.js
import * as XLSX from 'xlsx'

let cachedRates = null
let cacheTime = null
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

export async function getRates() {
  if (cachedRates && cacheTime && Date.now() - cacheTime < CACHE_DURATION) {
    return cachedRates
  }
  const url = process.env.RATES_FILE_URL
  if (!url) throw new Error('RATES_FILE_URL environment variable not set')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch rates: ${response.status}`)

  const buffer = await response.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const rates = {}
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    rates[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  })

  cachedRates = rates
  cacheTime = Date.now()
  return rates
}

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

export function buildRatesPrompt(rates, projectType, specLevel, bcisFactor) {
  try {
    const sheetName = Object.keys(rates).find(name =>
      name.toLowerCase().includes(projectType.toLowerCase()) ||
      name.toLowerCase().includes('rates') ||
      name.toLowerCase().includes('nrm')
    ) || Object.keys(rates)[0]

    if (!sheetName || !rates[sheetName]) {
      return '=== RATES: No matching rates found — use BCIS general benchmarks ==='
    }

    const rows = rates[sheetName]
    let prompt = `=== NRM1 BENCHMARK RATES ===\n`
    prompt += `Project Type: ${projectType} | Spec Level: ${specLevel} | BCIS Factor: ${bcisFactor}\n\n`

    rows.slice(0, 50).forEach(row => {
      if (row && row.length > 0) {
        prompt += row.filter(cell => cell !== null && cell !== undefined).join(' | ') + '\n'
      }
    })

    prompt += `\nApply BCIS factor ${bcisFactor} to all rates above.\n`
    prompt += `=== END RATES ===`

    return prompt
  } catch (error) {
    return `=== RATES ERROR: ${error.message} — use BCIS general benchmarks ===`
  }
}
