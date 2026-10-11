/**
 * programmeCalculator.js — Deterministic RIBA programme engine.
 * All durations and uplifts come from Estates_AI_Programme_v4_3.xlsx (ID-keyed, bands S1–S7;
 * S7 exists on the Construction sheet only and falls back to S6 wherever it is blank).
 * The AI never touches these numbers.
 */
import * as XLSX from 'xlsx'
import { countMeItems } from './buildingUse.js'
import { hasSiteContext, isHigherRiskBuilding } from './siteContext.js'
import { phasePlan, accessFlags, workWindow, blackoutPlan } from './questionSets.js'
import { aOrAn } from './article.js'

let _cache = { wb: null, fetchedAt: 0 }
let _inflight = null

// Exported so /api/rates-check can share this cache rather than opening its own
// uncached download of the same file on every health check. Callers arriving
// while a download runs share it (same pattern as lib/nrmWorkbook.js).
export async function fetchProgrammeWorkbook() {
  if (_cache.wb && Date.now() - _cache.fetchedAt < 10 * 60 * 1000) return _cache.wb
  _inflight ??= downloadProgrammeWorkbook().finally(() => { _inflight = null })
  return _inflight
}

async function downloadProgrammeWorkbook() {
  const now = Date.now()
  const url = process.env.PROGRAMME_FILE_URL
  if (!url) throw new Error('PROGRAMME_FILE_URL environment variable not set')
  let bytes
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to fetch Programme workbook: HTTP ${res.status}`)
    bytes = new Uint8Array(await res.arrayBuffer())
  } else {
    // A local path — tests and local verification only, like RATES_FILE_URL.
    const { readFile } = await import('node:fs/promises')
    bytes = new Uint8Array(await readFile(url))
  }
  const wb = XLSX.read(bytes, { type: 'array' })
  _cache = { wb, fetchedAt: now }
  return wb
}

// Workbook self-identification from the README sheet ("Version | v4.3 · June
// 2026 · ..."). Printed in the report's Estimate Basis for traceability.
export function parseWorkbookVersion(wb) {
  try {
    const ws = wb.Sheets['README']
    if (!ws) return null
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const row = rows.find(r => String(r[0] || '').trim().toLowerCase() === 'version')
    if (!row) return null
    const text = String(row[1] || '')
    const version = text.match(/v[\d][\d.]*/i)?.[0]
    const date = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/)?.[0]
    if (!version) return null
    return `Programme ${version}${date ? ` (${date})` : ''}`
  } catch {
    return null
  }
}

// ─── Size band ────────────────────────────────────────────────────────────────

// The limits are Modifiers rows SB-S1…SB-S7 (Programme v4.7): "< 150", "≤ 250",
// …, "> 10000". The first row whose limit the area meets is the band.
export function sizeBand(gifa, bands) {
  for (const b of bands) if (b.test(gifa)) return b.band
  throw new Error(`Programme workbook: no size band (SB-S1…SB-S7) covers ${gifa} m²`)
}

export function parseSizeBands(modTab) {
  return BANDS.map(band => {
    const raw = String(modTab[`SB-${band}`]?.value ?? '').trim()
    const m = raw.match(/^(<=|>=|<|>|≤|≥)\s*([\d,.]+)$/)
    if (!m) return null
    const op = { '<=': '≤', '>=': '≥' }[m[1]] || m[1], n = Number(m[2].replace(/,/g, ''))
    const test = { '<': v => v < n, '≤': v => v <= n, '>': v => v > n, '≥': v => v >= n }[op]
    return { band, test, limit: `${op} ${n}` }
  })
}

// Whole-programme sense-check envelopes, Modifiers rows PB-S1…PB-S7 ("6-65").
export function parseProgrammeBenchmarks(modTab) {
  const out = {}
  for (const band of BANDS) {
    const m = String(modTab[`PB-${band}`]?.value ?? '').match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/)
    if (m) out[band] = { min: Number(m[1]), max: Number(m[2]) }
  }
  return out
}

// Rows the engine needs; a workbook without one is refused rather than given a
// duration from the code (Programme v4.7 — the code holds no backup durations).
// Specialist scope (labs, clinical, data centres) by whole word: a plain
// substring test for "lab" matched "Ground floor slab", so every new build and
// extension took the specialist design uplift and Other or mixed jobs with a
// slab the Specialist construction row (test batch 4, October 2026).
const SPECIALIST_SCOPE = /\blab(s|oratory|oratories)?\b|\bclinical\b|\bdata centre/i

const REQUIRED_DURATIONS = ['DS2', 'DS3', 'DS4', 'GW', 'GW3', 'SV1', 'SV2', 'SV3', 'SV4', 'SV5', 'SV6', 'PL1', 'PL3', 'PL4', 'PL5', 'BC1', 'TN1', 'TN2']
// Modifiers rows read as a number (design multipliers, occupation, access and
// phasing uplifts). The code holds no backup for any of them (October 2026).
export const REQUIRED_MODIFIERS = ['Q23-NB', 'Q23-1', 'Q23-2', 'Q23-3', 'Q23-4', 'OCC-1', 'OCC-2', 'ACC-1', 'ACC-2', 'PH-1', 'ME-HEAVY']
const modNumber = (modTab, id) => {
  const v = modTab?.[id]?.value
  return v === '' || v == null ? NaN : Number(v)
}
export function checkProgrammeWorkbook({ durTab, conTab, modTab = {}, bands, benchmarks, restrictions }) {
  const problems = []
  for (const id of REQUIRED_DURATIONS) if (!durTab[id]) problems.push(`Durations has no ${id} row`)
  for (const id of REQUIRED_MODIFIERS) if (!Number.isFinite(modNumber(modTab, id))) problems.push(`Modifiers has no ${id} row with a number`)
  if (!parseRangeWeeks(modTab['FN-1']?.value)) problems.push('Modifiers FN-1 is missing or not "min-max" weeks')
  if (!getFloatEveryWeeks(modTab)) problems.push('Modifiers PROG-FLOAT is missing or not "+1 wk per N wks"')
  if (!conTab.CH1) problems.push('Construction has no CH1 (handover) row')
  bands.forEach((b, i) => { if (!b) problems.push(`Modifiers SB-${BANDS[i]} is missing or not "< n" / "≤ n" / "> n"`) })
  for (const band of BANDS) if (!benchmarks[band]) problems.push(`Modifiers PB-${band} is missing or not "min-max"`)
  // Site work restrictions (Q4.2b). `undefined` = not checked by this caller;
  // `null` = the workbook has no Restrictions sheet.
  if (restrictions === null) problems.push('the Restrictions sheet (site work restrictions) is missing')
  for (const r of restrictions || []) {
    if (!r.name) problems.push(`Restrictions ${r.id} has no Restriction wording`)
    if (r.bad) problems.push(`Restrictions ${r.id} Blocked periods must be MM-DD/MM-DD separated by ";"`)
    if (!r.uses.length) problems.push(`Restrictions ${r.id} names no building use`)
  }
  if (problems.length) throw new Error(`Programme workbook refused: ${problems.join('; ')}`)
}

// ─── Tab parsers ──────────────────────────────────────────────────────────────

/**
 * Durations sheet — ID-keyed, cols: ID, Phase, Activity, S1_Lo, S1_Hi, S2_Lo, S2_Hi, …
 * Returns { [id]: { activity, S1:{lo,hi}, S2:{lo,hi}, … } }
 */
function parseDurationsTab(wb) {
  const ws = wb.Sheets['Durations']
  if (!ws) throw new Error('Programme workbook missing "Durations" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!id || id.length > 20) continue  // skip section header rows
    table[id] = {
      id,
      activity: String(r[2] || '').trim(),
      S1: { lo: Number(r[3]) || 0, hi: Number(r[4]) || 0 },
      S2: { lo: Number(r[5]) || 0, hi: Number(r[6]) || 0 },
      S3: { lo: Number(r[7]) || 0, hi: Number(r[8]) || 0 },
      S4: { lo: Number(r[9]) || 0, hi: Number(r[10]) || 0 },
      S5: { lo: Number(r[11]) || 0, hi: Number(r[12]) || 0 },
      S6: { lo: Number(r[13]) || 0, hi: Number(r[14]) || 0 },
    }
  }
  return table
}

/**
 * Construction sheet — ID-keyed, same S1–S6 band structure plus S7 (> 10,000 m²)
 * from v4.5, found by its header. Returns { [id]: { name, S1:{lo,hi}, …, S7?:{lo,hi} } }
 */
function parseConstructionTab(wb) {
  const ws = wb.Sheets['Construction']
  if (!ws) throw new Error('Programme workbook missing "Construction" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  // S7 (> 10,000 m², Programme v4.5) is found by its header, so a workbook
  // without the columns still reads; a blank S7 falls back to S6 (bandMid).
  const s7 = (rows[0] || []).findIndex(h => String(h).trim().toLowerCase() === 's7_lo')
  const table = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!id) continue
    table[id] = {
      id,
      name: String(r[1] || '').trim(),
      ...(s7 > 0 ? { S7: { lo: Number(r[s7]) || 0, hi: Number(r[s7 + 1]) || 0 } } : {}),
      S1: { lo: Number(r[2]) || 0,  hi: Number(r[3]) || 0 },
      S2: { lo: Number(r[4]) || 0,  hi: Number(r[5]) || 0 },
      S3: { lo: Number(r[6]) || 0,  hi: Number(r[7]) || 0 },
      S4: { lo: Number(r[8]) || 0,  hi: Number(r[9]) || 0 },
      S5: { lo: Number(r[10]) || 0, hi: Number(r[11]) || 0 },
      S6: { lo: Number(r[12]) || 0, hi: Number(r[13]) || 0 },
    }
  }
  return table
}

/**
 * Modifiers sheet — ID-keyed.
 * Returns { [id]: { modifier, type, value } }
 */
function parseModifiersTab(wb) {
  const ws = wb.Sheets['Modifiers']
  if (!ws) throw new Error('Programme workbook missing "Modifiers" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!id) continue
    table[id] = { id, modifier: String(r[1] || '').trim(), type: String(r[3] || '').trim(), value: r[4], trigger: String(r[5] || '').trim() }
  }
  return table
}

/**
 * FastTrack sheet — one row per acceleration lever. Cols: LeverID, Lever,
 * Trigger (when offered), Action on programme, Approx weeks saved, Trade-off.
 * Returns [] when the sheet is absent. FT1 (start point) is applied to the
 * headline programme elsewhere; the rest are OFFERED, never applied — the
 * report lists the ones whose trigger fires so the client can choose.
 */
function parseFastTrackTab(wb) {
  const ws = wb.Sheets['FastTrack']
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const levers = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!/^FT\d+$/i.test(id)) continue
    levers.push({
      id: id.toUpperCase(),
      lever:      String(r[1] || '').trim(),
      trigger:    String(r[2] || '').trim(),
      action:     String(r[3] || '').trim(),
      weeksSaved: String(r[4] || '').trim(),
      tradeOff:   String(r[5] || '').trim(),
    })
  }
  return levers
}

// PROG-FLOAT "+1 wk per 13 wks" → 13. 0 when the row is absent or unparseable,
// which checkProgrammeWorkbook() refuses.
function getFloatEveryWeeks(modTab) {
  const raw = String(modTab['PROG-FLOAT']?.value || '')
  const m = raw.match(/per\s*(\d+)/i)
  return m ? Number(m[1]) : 0
}

// ─── Mid-point helpers ────────────────────────────────────────────────────────

const BANDS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']

function bandMid(entry, band) {
  if (!entry) return 0
  const { lo, hi } = entry[band] || {}
  if (!lo && !hi) {
    // Only fall back for S5–S7 where cells may be blank (e.g. CX1 — extension
    // doesn't apply at very large scale; S7 exists only on the Construction
    // sheet, so every Durations row reads its S6 values above 10,000 m²).
    // S1–S4 zeros are intentional (e.g. GW3 = 0 for small projects) and must not be overridden.
    if (band !== 'S5' && band !== 'S6' && band !== 'S7') return 0
    const fallbackOrder = BANDS.slice(0, BANDS.indexOf(band)).reverse()
    for (const fb of fallbackOrder) {
      const fbv = entry[fb]
      if (fbv && (fbv.lo || fbv.hi)) return (fbv.lo + fbv.hi) / 2
    }
    return 0
  }
  return (lo + hi) / 2
}

// ─── Modifier lookups ─────────────────────────────────────────────────────────

// `level` is the level of intervention that applies (see calculateProgramme):
// blank where the project type doesn't use one, which reads as Q23-3 (×1.0).
function getDesignMultiplier(modTab, answers, level) {
  const pt = (answers.q1_2_projectType || '').toLowerCase()
  if (pt.includes('new build') || pt.includes('external') || pt.includes('demolition')) {
    return modNumber(modTab, 'Q23-NB')
  }
  const iv = (level || '').toLowerCase()
  if (iv.includes('fabric'))          return modNumber(modTab, 'Q23-1')
  if (iv.includes('minor'))           return modNumber(modTab, 'Q23-2')
  if (iv.includes('reconfiguration')) return modNumber(modTab, 'Q23-4')
  return modNumber(modTab, 'Q23-3')
}

function getOccupationUplift(modTab, occupation) {
  const occ = occupation.toLowerCase()
  if (occ.includes('fully occupied')) return modNumber(modTab, 'OCC-1')
  if (occ.includes('partial'))        return modNumber(modTab, 'OCC-2')
  return 0
}

// Q3.5 through accessFlags() (current and pre-October-2026 labels). Works
// limited to certain periods no longer takes ACC-2: the construction is
// fitted into the Q3.5a windows instead (scheduleInWindow), which is the real
// effect the old uplift stood in for.
function getAccessUplift(modTab, answers) {
  const f = accessFlags(answers)
  if (f.deliveries) return modNumber(modTab, 'ACC-2')
  if (f.hours || f.shared || f.tight || f.road) return modNumber(modTab, 'ACC-1')
  return 0
}

/**
 * Site work restrictions (Q4.2b), the 'Restrictions' sheet: one row per
 * option — ID, Building uses (Q1.3 labels, ";"), Restriction and Dates shown
 * (the user reads "Restriction (Dates shown)"), Blocked periods ("MM-DD/MM-DD;
 * …", repeated every year, a period may cross the new year), Notes. Columns
 * are found by header text. The code holds no calendar of its own. Pure.
 */
export function parseRestrictionRows(rows) {
  const h = rows.findIndex(r => String(r[0]).trim() === 'ID' && r.some(c => /blocked periods/i.test(String(c))))
  if (h < 0) return null
  const col = re => rows[h].findIndex(c => re.test(String(c)))
  const c = { uses: col(/building uses/i), name: col(/^restriction$/i), dates: col(/dates shown/i), periods: col(/blocked periods/i) }
  return rows.slice(h + 1).filter(r => String(r[0] || '').trim()).map(r => {
    const name = String(r[c.name] ?? '').trim(), dates = String(r[c.dates] ?? '').trim()
    const parts = String(r[c.periods] ?? '').split(';').map(s => s.trim()).filter(Boolean)
    const ranges = parts.map(p => p.split('/').map(x => x.trim())).filter(x => x.length === 2 && x.every(v => /^\d{2}-\d{2}$/.test(v)))
    return {
      id: String(r[0]).trim(), name, label: dates ? `${name} (${dates})` : name,
      uses: String(r[c.uses] ?? '').split(';').map(s => s.trim()).filter(Boolean),
      ranges, bad: !ranges.length || ranges.length !== parts.length,
    }
  })
}

function parseRestrictionsTab(wb) {
  const ws = wb.Sheets['Restrictions']
  return ws ? parseRestrictionRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })) : null
}

/** For the questionnaire (/api/scope-items): the restriction options and which building uses see them. */
export async function getBlackoutOptions() {
  const { restrictions } = programmeTabs(await fetchProgrammeWorkbook())
  return restrictions.map(({ id, label, uses }) => ({ id, label, uses }))
}

// School holidays for a "holidays only" window: Modifiers rows HOL-*, value
// "MM-DD/MM-DD" (a range may cross the new year). No rows, no scheduling —
// the code never invents a calendar.
function holidayRanges(modTab) {
  return Object.values(modTab)
    .filter(m => /^HOL-/i.test(m.id))
    .map(m => String(m.value || '').split('/').map(x => x.trim()))
    .filter(r => r.length === 2 && r.every(x => /^\d{2}-\d{2}$/.test(x)))
}

const WEEK_MS = 7 * 24 * 3600 * 1000

/**
 * Fits `workWeeks` of construction into the allowed weeks of a Q3.5a window,
 * from programme week `startWeek`. A week counts when its middle day falls in
 * an allowed period. Returns `wait` (weeks before the first allowed week —
 * not construction), `elapsed` (first to last working week) and how many
 * working weeks fitted (fewer when an "only within" window runs out). Pure.
 */
export function scheduleInWindow(startDate, startWeek, workWeeks, win, holidays = []) {
  if (!win || workWeeks <= 0) return { wait: 0, elapsed: workWeeks, worked: workWeeks, short: 0 }
  if (win.type === 'holidays' && !holidays.length) return { wait: 0, elapsed: workWeeks, worked: workWeeks, short: 0, noCalendar: true }
  const lastEnd = win.type === 'only' ? win.periods.map(p => p.to).sort().pop() : null
  const inRange = (md, [a, b]) => a <= b ? md >= a && md <= b : md >= a || md <= b
  const allowed = d => {
    const iso = d.toISOString().slice(0, 10)
    if (win.type === 'blackout') {
      return !win.recurring.some(r => inRange(iso.slice(5), r)) && !win.periods.some(p => iso >= p.from && iso <= p.to)
    }
    if (win.type === 'holidays') {
      const md = iso.slice(5)
      return holidays.some(([a, b]) => a <= b ? md >= a && md <= b : md >= a || md <= b)
    }
    const inPeriod = win.periods.some(p => iso >= p.from && iso <= p.to)
    return win.type === 'except' ? !inPeriod : inPeriod
  }
  let worked = 0, w = 0, first = -1, last = -1
  while (worked < workWeeks && w < 520) {
    const mid = new Date(startDate.getTime() + (startWeek + w) * WEEK_MS + 3 * 24 * 3600 * 1000)
    if (lastEnd && mid.toISOString().slice(0, 10) > lastEnd) break
    if (allowed(mid)) { worked++; if (first < 0) first = w; last = w }
    w++
  }
  if (first < 0) return { wait: 0, elapsed: 0, worked: 0, short: workWeeks }
  return { wait: first, elapsed: last - first + 1, worked, short: workWeeks - worked }
}

// "4-8" → { lo: 4, hi: 8 }; null when not a min-max range.
function parseRangeWeeks(value) {
  const m = String(value ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/)
  return m ? { lo: Number(m[1]), hi: Number(m[2]) } : null
}

// FN-1 "4-8" → 6 weeks (the mid-point); checkProgrammeWorkbook() refuses a
// workbook without it.
function getGrantGovernanceWeeks(modTab) {
  const r = parseRangeWeeks(modTab['FN-1']?.value)
  return Math.round((r.lo + r.hi) / 2)
}

// ─── Construction type selector ───────────────────────────────────────────────

function selectConstructionId(projectType, specLevel, scopeItems, storeys, buildingUse, interventionLevel, meItemCount, available = null) {
  const has = id => !available || available.has(id)
  const pt    = projectType.toLowerCase()
  const bu    = (buildingUse || '').toLowerCase()
  const il    = (interventionLevel || '').toLowerCase()
  const scope = (scopeItems || []).map(s => String(s).toLowerCase())
  const hasHighSpec = specLevel === 'High'

  if (pt.includes('new build')) {
    if (bu.includes('healthcare') || bu.includes('clinical')) return 'CN2'
    if (bu.includes('industrial') || bu.includes('warehouse')) return 'CN3'
    return 'CN1'
  }
  if (pt.includes('demolition'))     return 'CD1'
  if (pt.includes('external works')) return 'CE1'
  if (pt.includes('extension'))
    return (Number(storeys) > 1) ? 'CX2' : 'CX1'

  const hasLab = scope.some(s => s === '4.4' || SPECIALIST_SCOPE.test(s) || s.includes('healthcare'))
  if (hasLab) return 'CS1'

  // Cat B (reconfiguration) fit-outs take the Cat B row whatever the spec —
  // test batch 3 timed a Cat B office fit-out on the Cat A row (FO-8).
  if (pt.includes('fit-out') || pt.includes('fit out'))
    return hasHighSpec || il.includes('reconfiguration') ? 'CF1' : 'CF2'

  const hasFabric = scope.some(s =>
    /^2\./.test(s) || /\broof/.test(s) || s.includes('facade') || s.includes('external wall') ||
    s.includes('window') || s.includes('waterproof') || s.includes('cladding'))

  // Fabric/finishes-only or minor services → never M&E Replacement: envelope
  // work (roof, walls, windows) is the Fabric / Envelope row, everything else
  // a basic fit-out. It used to be CF2 regardless, so a decarbonisation
  // re-roof and re-glaze (Computer Science) was timed as an office fit-out.
  if (il.includes('fabric and finishes') || il.includes('finishes with minor')) return hasFabric ? 'CR2' : 'CF2'

  // Exclude 5.20 (BWIC — auto-added whenever any Group 5 item is present, not a standalone system)
  const isMeCode    = s => /^5\./.test(s) && s !== '5.20'
  const isMeKeyword = s =>
    s.includes('heating') || s.includes('ventil') || s.includes('electric') ||
    s.includes('plumb')   || s.includes('air conditioning') || s.includes('gas') ||
    s.includes('sprinkler') || s.includes('emergency') || s.includes('fire alarm')
  // NRM1 v5.2: one item (Heating and hot water) replaces three v4.5 codes, so
  // the scope engine's own Group 5 item count is used when it is given.
  const meTotal = meItemCount ?? scope.filter(s => isMeCode(s) || isMeKeyword(s)).length
  // Back to frame: a reconfiguration with new walls or windows and full M&E
  // (Programme v4.6 CR3) — the M&E row alone gave 49 weeks for a 9,000 m²
  // office with a new unitised façade (RF-9).
  const hasEnvelope = scope.some(s => s.includes('external wall') || s.includes('window') || s === '2.5' || s === '2.6')
  if (meTotal >= 3 && il.includes('reconfiguration') && hasEnvelope && has('CR3')) return 'CR3'
  if (meTotal >= 3) return 'CR1'

  if (hasFabric) return 'CR2'

  // Group 1 (1.1–1.4 substructure) has no test above and falls through to
  // here. That was previously unreachable for any project type able to price
  // it — New Build and Extension both return earlier, and every other type
  // had substructure hidden by priceableFor(). The project-type-axis slice
  // makes group 1 reachable on "Other or mixed" via the new-build rate
  // fallback (lib/projectTypes.js), so a mixed project with foundations now
  // lands here and gets a Fit-Out — Basic/Cat A construction duration: the
  // Construction sheet has no row for a mixed project (only CN/CX/CR/CF/CS/
  // CE/CD), and inventing one in code would violate the no-numbers-in-code
  // rule. Recorded as a known gap, not fixed — see CLAUDE.md and the spec's
  // "Not in this slice" table.
  return hasHighSpec ? 'CF1' : 'CF2'
}

// ─── Programme assumptions ────────────────────────────────────────────────────

function buildProgrammeAssumptions(answers, result) {
  const occupation  = answers.q3_6_occupation || ''
  const gifa        = Number(answers.q1_5_size)
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const {
    tenderWeeks, occupationUplift, accessUplift,
    planningRequired, bcRequired, surveyWeeks, s2Done, startStageLabel,
    floatWeeks = 0, floatEvery = 0, totalWeeksBestCase,
    startDateAssumed = true, startLabel = 'the report date', proc, tenderId,
  } = result

  let occupationNote = 'No occupation uplift applied — building vacant or not applicable.'
  if (occupation.toLowerCase().includes('fully occupied'))
    occupationNote = `${aOrAn(Math.round(occupationUplift * 100))} ${Math.round(occupationUplift * 100)}% construction duration uplift has been applied for full occupation — phasing, noise and dust management, and increased supervision.`
  else if (occupation.toLowerCase().includes('partial'))
    occupationNote = `${aOrAn(Math.round(occupationUplift * 100))} ${Math.round(occupationUplift * 100)}% construction duration uplift has been applied for partial occupation — section-by-section handover and phased access.`

  // Access-constraint uplift (ACC-1/ACC-2 from the Modifiers sheet) was applied
  // to construction duration exactly like the occupation uplift above, but was
  // only ever surfaced in the Construction stage's own row notes — never in
  // this assumptions list, so a report could show a 30% occupation uplift here
  // and nowhere mention the access-constraint uplift that was also applied.
  const accessNote = accessUplift > 0
    ? `${aOrAn(Math.round(accessUplift * 100))} ${Math.round(accessUplift * 100)}% construction duration uplift has been applied for access constraints (Q3.5) — the highest single applicable tier only; access-constraint uplifts are never stacked with each other.`
    : 'No access-constraint uplift applied — no qualifying restriction was identified from Q3.5.'

  const procNote = proc
    ? `The tender period (${tenderWeeks} weeks, ${tenderId}) follows the preferred route to market in the Procurement section (${proc.routeToMarket?.name || 'formal tender'}). A different route to market would change it.`
    : `The tender period (${tenderWeeks} weeks, TN1) is provisional until the procurement suggestion is made.`
  const floatNote = floatWeeks > 0
    ? `A programme float of ${floatWeeks} week(s) (1 week per ${floatEvery} weeks of critical path, Modifiers PROG-FLOAT) is included in the headline programme. The best-case programme without float is ${totalWeeksBestCase} weeks; the client should plan around the with-float figure.`
    : 'No programme float is included — the headline programme is a best-case critical path with no contingency for slippage.'

  return [
    'Programme durations are indicative only and based on information provided at RIBA Stage 0–1. Actual durations to be confirmed at Stage 2 once surveys, design scope, and procurement strategy are finalised.',
    'Durations assume client decision-making within the gateway periods shown. Delays to client sign-off will extend the programme accordingly.',
    ...(planningRequired
      ? ['Planning determination periods are based on statutory LPA timescales. No allowance has been made for objections, committee referral, or appeals.']
      : ['Planning consent is not required for these works based on the stated route (Q3.4). This is a statement about planning only — see the separate building control note below.']),
    // Planning consent and Building Control (Building Regulations) approval are
    // two independent regimes; a permitted-development or "no consent required"
    // planning answer says nothing about whether Building Regulations apply.
    // This used to be asserted as one combined sentence — "no statutory planning
    // or building control consent is required" — purely from the Q3.4 planning
    // answer, which is wrong whenever the works involve structural alteration,
    // drainage, ventilation/extract, fire safety, or a change of use: those
    // remain notifiable under Building Regulations regardless of the planning
    // route, and this tool has no dedicated question that actually establishes
    // building control status. Never assert its absence; say it is unconfirmed.
    ...(bcRequired
      ? ['Building control approval: LABC Full Plans route assumed (5–8 weeks), running in parallel with Stage 4. A private RBCA (3–5 weeks) should be considered for programme-critical projects — decision to be confirmed by the PM at Stage 2.']
      : ['Building control (Building Regulations) status has not been established by this questionnaire and must not be assumed from the planning answer above — structural work, drainage, ventilation/extract, fire safety and change-of-use works are commonly notifiable even under permitted development. Confirm building control applicability with a Building Control Body at Stage 2 before proceeding.']),
    `Construction duration is benchmarked against ${gifa} m² ${projectType} at standard productivity rates. Actual duration to be confirmed at Stage 2 by the appointed contractor.`,
    occupationNote,
    accessNote,
    // "Surveys shown at the start of Stage 2" is only true when Stage 2 is
    // actually still in the programme — a project starting at Stage 3+ (FT1,
    // design already reached) has no Stage 2 row at all, so this used to
    // assert a milestone that does not exist in that programme.
    ...(surveyWeeks > 0
      ? [s2Done
          ? `Surveys are identified as required but not yet commissioned. As the design stage reached (${startStageLabel || 'a later stage'}) means Stage 2 is not shown, commissioning surveys immediately is a gateway condition before the remaining programme proceeds.`
          : 'Surveys shown at the start of Stage 2 are identified as required but not yet commissioned. Commissioning surveys before Stage 2 commences is a gateway condition.']
      : []),
    startDateAssumed
      ? `Calendar dates assume the programme starts on the report date (${startLabel}) — no expected start was given at Q4.0. Week 0 is Stage 1 Gateway approval; every date shifts with the actual start.`
      : `Calendar dates run from the stated expected start of ${startLabel} (Q4.0), taken as Stage 1 Gateway approval (Week 0). A later start shifts every date accordingly.`,
    floatNote,
    procNote,
    'Handover (RIBA Stage 6) covers snagging, Practical Completion, O&M information and client move-in; commissioning is assumed to run within the last weeks of construction. The defects liability period is not shown — it begins at Practical Completion and is typically 12 months.',
  ]
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {object} [opts.scope]  cost.scopeSummary from the cost engine: the v4.5
 *   codes each ticked v5.2 item replaces plus the item names (`tokens`), and a
 *   true Group 5 item count (`meItemCount`). This engine's scope tests are
 *   written against v4.5 codes and keywords, so the summary keeps them meaning
 *   what they meant. Without it (older callers) the raw answer is read.
 * @param {object} [opts.procurement]  the Procurement Reference recommendation
 *   (lib/procurementCalculator.js). Its preferred route to market sets the
 *   tender period; construction weeks never depend on it.
 */
// The parsed sheets, once per downloaded workbook rather than on every call —
// a report runs the programme once, a scenario comparison three or four times.
// The tables are read-only below.
const _tabs = new WeakMap()

function programmeTabs(wb) {
  let tabs = _tabs.get(wb)
  if (!tabs) {
    tabs = {
      durTab: parseDurationsTab(wb),
      conTab: parseConstructionTab(wb),
      modTab: parseModifiersTab(wb),
      ftTab: parseFastTrackTab(wb),
      restrictions: parseRestrictionsTab(wb),
    }
    tabs.bands = parseSizeBands(tabs.modTab)
    tabs.benchmarks = parseProgrammeBenchmarks(tabs.modTab)
    checkProgrammeWorkbook(tabs)
    _tabs.set(wb, tabs)
  }
  return tabs
}

/** For /api/rates-check: the size-band limits as the workbook states them. Throws what the engine would refuse. */
export function programmeWorkbookSummary(wb) {
  const { bands, benchmarks } = programmeTabs(wb)
  return { sizeBands: bands.map(b => `${b.band} (${b.limit})`), benchmarks }
}

export async function calculateProgramme(answers, costMidpoint, opts = {}) {
  const wb     = await fetchProgrammeWorkbook()
  const { durTab, conTab, modTab, ftTab, bands, benchmarks, restrictions } = programmeTabs(wb)

  const gifa              = Number(answers.q1_5_size)
  if (!(gifa > 0)) throw new Error('Programme: the area (Q1.5) is missing — no duration can be read without it')
  const projectType       = answers.q1_2_projectType || 'Refurbishment'
  const scopeItems        = opts.scope?.tokens || answers.q2_2_scopeItems || []
  const knownIssues       = answers.q3_1_knownIssues || []
  const age               = answers.q1_4_buildingAge || ''
  const occupation        = answers.q3_6_occupation || ''
  const planningType      = answers.q3_4_planningConsents || 'No consent required'
  const specLevel         = answers.q2_4_specLevel || 'Standard'

  const band = sizeBand(gifa, bands)

  // Design multiplier from Modifiers sheet (owned by Programme, not NRM1)
  // The level of intervention that applies. With the cost engine's scope
  // summary it is null for types that don't use one (Extension, Other or
  // mixed) even when a stale answer is stored, so a pre-v5.2 Extension draft
  // can't shorten the design stages while its cost ignores the same answer.
  const appliedLevel = opts.scope ? (opts.scope.interventionLevel || '') : (answers.q2_3_interventionLevel || '')
  const designMultiplier = getDesignMultiplier(modTab, answers, appliedLevel)

  // Helper: mid-point for a Durations ID at current band
  const dur = (id, fallback = 0) => {
    const entry = durTab[id]
    if (!entry) return fallback
    return bandMid(entry, band) || fallback
  }

  // Design and review rows by project type (Programme v4.6): "DS2-FO" for a
  // fit-out, "-EW" for external works only, "-DM" for demolition only, used
  // instead of the building row when the workbook has one. Test batch 3: a
  // playground and a Cat B fit-out went through a new building's design
  // stages. A 0 in such a row is a real answer (no Stage 3 review).
  const TYPE_SUFFIX = { 'fit-out': 'FO', 'external works only': 'EW', 'demolition only': 'DM' }
  const typeSuffix = TYPE_SUFFIX[String(answers.q1_2_projectType || '').toLowerCase()] || null
  const typeDur = (id, fallback = 0) => {
    const own = typeSuffix && durTab[`${id}-${typeSuffix}`]
    if (own) return bandMid(own, band) ?? 0
    return dur(id, fallback)
  }

  // Helper: mid-point for a Construction ID at current band
  // No backup duration in code (October 2026): a missing row is a workbook
  // error, never a guessed number of weeks.
  const conDur = id => {
    const entry = conTab[id]
    if (!entry) throw new Error(`Programme workbook: Construction has no ${id} row`)
    return bandMid(entry, band)
  }

  // ── Derived flags ────────────────────────────────────────────────────────────
  // Read the band's START year rather than substring-matching its label. The old
  // version tested for the literal tokens "1945" and "1980–2000", so relabelling
  // a Q1.4 option — which is a presentation change — silently moved buildings
  // onto a different survey path. Parsing the year makes the label free to
  // change and handles both the current bands and any saved from older drafts.
  // "Pre-1900" is special-cased because its only 4-digit token is the boundary
  // itself, not the start of the band.
  const ageStartYear = age.includes('Pre-1900')
    ? 1899
    : (Number((age.match(/\d{4}/) || [])[0]) || null)
  const isPreMinus1980 = ageStartYear !== null && ageStartYear < 1980
  const isPreMinus2000 = ageStartYear !== null && ageStartYear < 2000
  const hasDemo       = scopeItems.some(s => s === '0.2' || String(s).toLowerCase().includes('demolition') || String(s).toLowerCase().includes('structural alterations'))
  const hasAsbestos   = knownIssues.some(i => i.toLowerCase().includes('asbestos'))
  const hasStructural = knownIssues.some(i => i.toLowerCase().includes('structural')) ||
                        scopeItems.some(s => s === '7.1' || String(s).toLowerCase().includes('structural'))
  const isNewBuild    = projectType.toLowerCase().includes('new build')
  const isExtension   = projectType.toLowerCase().includes('extension')
  const isRefurb      = !isNewBuild && !isExtension &&
                        !projectType.toLowerCase().includes('external') &&
                        !projectType.toLowerCase().includes('demolition') &&
                        !projectType.toLowerCase().includes('renewable')

  // ── Pre-design surveys ───────────────────────────────────────────────────────
  const stages = []
  let surveyWeeks = 0

  if (isPreMinus2000 && !isNewBuild) {
    // Strip-out disturbs the fabric as demolition does, so it needs a
    // refurbishment & demolition survey, not a management survey (v4.5 0.3 or
    // any v5 item named strip-out).
    const hasStripOut = scopeItems.some(s => String(s) === '0.3' || /strip.?out/i.test(String(s)))
    const useRd = hasDemo || hasStripOut || hasAsbestos || isPreMinus1980
    const id    = useRd ? 'SV2' : 'SV1'
    const wks   = Math.ceil(dur(id))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Asbestos Survey', activity: useRd ? 'Refurbishment/Demolition Survey' : 'Management Survey', weeks: wks, parallel: true, notes: 'Pre-design — parallel with Stage 2–3' })
  }

  if (hasStructural && !isNewBuild) {
    const wks = Math.ceil(dur('SV3'))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Structural Survey', activity: 'Independent structural inspection', weeks: wks, parallel: true, notes: 'Pre-design — parallel with Stage 2–3' })
  }

  if (isRefurb) {
    const wks = Math.ceil(dur('SV4'))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Condition Survey', activity: 'Building condition survey', weeks: wks, parallel: true, notes: 'Pre-design — parallel with other surveys' })
  }

  if (isNewBuild || isExtension) {
    const wks = Math.ceil(dur('SV5'))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Topographic Survey', activity: 'Topographic and measured building survey', weeks: wks, parallel: true, notes: 'Pre-design' })
  }

  const hasBrownfield = knownIssues.some(i => i.toLowerCase().includes('contaminated'))
  if (isNewBuild || isExtension || hasBrownfield) {
    const wks = Math.ceil(dur('SV6'))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Ground Investigation', activity: 'Ground investigation and geotechnical report', weeks: wks, parallel: true, notes: 'Pre-design — parallel with other surveys' })
  }

  // Ecology / bat survey (SV7, September 2026). Triggered by the Q3.8 ecology
  // option, or by roof works on a pre-2000 building — roof voids are the
  // classic roost. Emergence surveys can only be done May–September, so a
  // missed window is a whole-year slip; the seed in lib/prose.js carries that.
  // Only priced from the workbook row: no SV7 row → no stage, no duration.
  // v4.5 roof (2.3) and fabric/envelope repairs (7.2), or any v5.2 item named
  // for a roof ("Roof", "Roof terrace and green roof").
  // October 2026 (test batch 3): only work to an EXISTING roof counts — an
  // Extension's roof is new, and fabric repairs (v4.5 7.2) are not roof-void
  // works, yet both raised a bat survey on projects with no ecology answer.
  const hasRoofScope = scopeItems.some(s => String(s) === '2.3' || /\broof\b/i.test(String(s)))
  const ecologyTriggered = hasSiteContext(answers, 'ecology') || (hasRoofScope && isPreMinus2000 && !isNewBuild && !isExtension)
  if (ecologyTriggered && durTab['SV7']) {
    const wks = Math.ceil(dur('SV7', 0))
    if (wks > 0) {
      surveyWeeks = Math.max(surveyWeeks, wks)
      stages.push({ stage: 'Ecology Survey', activity: 'Ecology / bat survey', weeks: wks, parallel: true, notes: 'Pre-design — seasonal (emergence surveys May–September only)' })
    }
  }

  // ── Design stages ────────────────────────────────────────────────────────────
  const meCount = opts.scope?.meItemCount ?? countMeItems(scopeItems)
  const hasSpecialist = scopeItems.some(s => s === '4.4' || s === '6.2' || SPECIALIST_SCOPE.test(String(s)))

  // Stage 2
  let s2Weeks = typeDur('DS2') * designMultiplier
  if (hasStructural)             s2Weeks += dur('DS2a', 0)
  if (age.includes('Pre-1900'))  s2Weeks += dur('DS2b', 0)
  s2Weeks = Math.ceil(s2Weeks)

  // Stage 3
  let s3Weeks = typeDur('DS3') * designMultiplier
  // M&E-heavy threshold: Modifiers ME-HEAVY (Programme v4.10; was a 4 in this file).
  const meHeavy = meCount >= modNumber(modTab, 'ME-HEAVY')
  if (meHeavy)        s3Weeks += dur('DS3a', 0)
  if (hasSpecialist)  s3Weeks += dur('DS3b', 0)
  s3Weeks = Math.ceil(s3Weeks)

  // Stage 4
  let s4Weeks = typeDur('DS4') * designMultiplier
  if (meHeavy || hasSpecialist) s4Weeks += dur('DS4a', 0)
  s4Weeks = Math.ceil(s4Weeks)

  // Gateways — read from workbook; GW3 is 0 for S1/S2 (workbook encodes this)
  const gatewayWks  = Math.ceil(typeDur('GW'))
  const gateway3Wks = Math.ceil(typeDur('GW3'))  // 0 for S1/S2, 2 for S3+

  // ── FastTrack FT1: start point = design stage already reached ────────────────
  // The Programme workbook's FastTrack sheet (lever FT1) specifies: when design
  // is already past Stage 1, remove the completed design stages from the critical
  // path and start the programme at the next stage. A completed stage drops its
  // own design weeks, its trailing client gateway, and any consent that runs in
  // parallel with it (planning ∥ Stage 3, Building Control ∥ Stage 4). Without
  // this, a project that has paid for completed design still gets the full
  // Stage 2–4 duration — contradicting the reduced professional-fee % the cost
  // engine already applies for the same answer.
  const ds = (answers.q4_5_designStage || '').toLowerCase()
  const s4Done = ds.includes('stage 4') || ds.includes('technical')
  const s3Done = s4Done || ds.includes('stage 3') || ds.includes('developed')
  const s2Done = s3Done || ds.includes('stage 2') || ds.includes('concept complete')
  if (s2Done) s2Weeks = 0
  if (s3Done) s3Weeks = 0
  if (s4Done) s4Weeks = 0
  // Trailing gateways drop with their stage; consents drop when their parallel
  // stage is complete (handled below where planningWks / bcWks are set).
  const gw2 = s2Done ? 0 : gatewayWks
  const gw3 = s3Done ? 0 : gateway3Wks
  const gw4 = s4Done ? 0 : gatewayWks

  // One-line explanation for the report + prompt (empty when nothing skipped).
  let programmeStartNote = ''
  if (s2Done) {
    const reachedLabel = answers.q4_5_designStage || ''
    const startStage = s4Done ? 'tender / procurement' : s3Done ? 'Stage 4 (Technical Design)' : 'Stage 3 (Developed Design)'
    const completedRange = s4Done ? 'Stages 2–4' : s3Done ? 'Stages 2–3' : 'Stage 2'
    programmeStartNote = `Design stage reached: ${reachedLabel} — ${completedRange} treated as already complete and removed from the programme; remaining work starts at ${startStage}. Assumes the existing design is sound and reusable${s4Done ? ', and that statutory consents have progressed in step with the design' : s3Done ? '; any planning application is taken as submitted at the end of Stage 3, with its determination still to come' : ''}.`
  }

  // ── Consent flags (govern planning / building-control wording) ────────────────
  const pl = planningType.toLowerCase()
  const planningRequired = pl.includes('full planning') || pl.includes('prior approval') ||
                           pl.includes('change of use') || pl.includes('unsure') ||
                           pl.includes('pre-application')
  // Building Regulations Full Plans apply to building work: not to external
  // works or a demolition (which needs a s80 demolition notice instead) —
  // test batch 3 found both carrying an LABC Full Plans stage.
  const ptLower = projectType.toLowerCase()
  const bcRequired = !pl.includes('permitted development') && !pl.includes('no consent') &&
    !ptLower.includes('external works') && !ptLower.includes('demolition')

  if (!s2Done) {
    stages.push({ stage: 'Stage 2',  activity: 'Concept Design', weeks: s2Weeks, notes: 'Includes surveys at start of stage' })
    stages.push({ stage: 'Gateway',  activity: 'Client Review — Stage 2', weeks: gw2, notes: 'Client sign-off' })
  }
  if (!s3Done) {
    stages.push({ stage: 'Stage 3',  activity: planningRequired ? 'Developed Design — planning application submitted at start of stage' : 'Developed Design', weeks: s3Weeks, notes: planningRequired ? 'Planning application submitted at start; determination runs in parallel' : 'Full developed design — no planning consent required' })
  }

  // ── Planning (parallel with Stage 3, or Stage 4 when Stage 3 is complete) ─────
  // Skipped only when Stage 4 is complete (FT1) — consent is then assumed held.
  // With Stage 3 complete but not Stage 4, the application goes in at the end
  // of Stage 3 (RIBA Plan of Work), so the determination still lies ahead: it
  // runs alongside Stage 4 and holds tender if it outlasts it. It used to be
  // dropped with Stage 3, so a "Developed design" answer with "Full planning"
  // printed a programme with no planning in it (test reports NB-3, OM-3) while
  // the cost build-up still applied the full-planning rate.
  let planningWks  = 0
  let planningNote = ''
  const planningAlongside = s3Done ? 'Stage 4' : 'Stage 3'

  if (s4Done) {
    // no planning rows — handled by programmeStartNote
  } else if (pl.includes('full planning') && pl.includes('listed')) {
    // Combined: use the longer of PL1/PL2 (both are same in v4.3, use PL1)
    planningWks  = Math.ceil(dur('PL1'))
    planningNote = 'Dual consent — Full Planning and Listed Building Consent run concurrently where possible; parallel with Stage 3 design'
  } else if (pl.includes('full planning')) {
    planningWks  = Math.ceil(dur('PL1'))
    planningNote = 'Statutory 8-week determination period — parallel with Stage 3 design'
  } else if (pl.includes('prior approval')) {
    planningWks  = Math.ceil(dur('PL3'))
    planningNote = 'Prior approval — shorter statutory period; parallel with Stage 3 design'
  } else if (pl.includes('change of use')) {
    planningWks  = Math.ceil(dur('PL4'))
    planningNote = 'Change of use consent — same statutory period as full planning; parallel with Stage 3 design'
  } else if (pl.includes('unsure') || pl.includes('pre-application')) {
    planningWks  = Math.ceil(dur('PL5'))
    planningNote = 'Pre-application advice recommended before formal submission; parallel with Stage 3 design'
  }

  if (s3Done) planningNote = planningNote.replace('parallel with Stage 3 design', 'application submitted at the end of Stage 3; determination runs in parallel with Stage 4')
  // Alongside Stage 3 an overrun holds Stage 4; alongside Stage 4 it holds
  // tender instead, and is added after Stage 4 below (planningLateWks).
  const planningOverrunWks = planningWks > 0 && !s3Done ? Math.max(0, planningWks - s3Weeks) : 0

  if (planningWks > 0) {
    stages.push({ stage: 'Planning', activity: `Planning consent determination (parallel with ${planningAlongside})`, weeks: planningWks, parallel: true, notes: planningNote })
    if (planningOverrunWks > 0) {
      stages.push({ stage: 'Planning — wait', activity: 'Awaiting LPA determination — Stage 4 on hold', weeks: planningOverrunWks,
        notes: `Planning determination extends ${planningOverrunWks} wk(s) beyond Stage 3. Stage 4 cannot start until consent is received.` })
    }
  }

  if (gw3 > 0) {
    stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 3', weeks: gw3, notes: 'Client sign-off' })
  }
  if (!s4Done) {
    stages.push({ stage: 'Stage 4', activity: bcRequired ? 'Technical Design — building control submission at start of stage' : 'Technical Design — full construction information', weeks: s4Weeks, notes: bcRequired ? 'Full construction information; BC runs in parallel' : 'Full construction information' })
  }

  // ── Building Control (parallel with Stage 4) ──────────────────────────────────
  // Skipped when Stage 4 is already complete (FT1) — approval assumed progressed
  // in step with the technical design.
  let bcWks = 0
  if (bcRequired && !s4Done) {
    bcWks = Math.ceil(dur('BC1'))
    stages.push({ stage: 'Building Control', activity: 'LABC Full Plans submission (parallel with Stage 4)', weeks: bcWks, parallel: true,
      notes: 'Runs in parallel with Stage 4. Private RBCA (3–5 wks) is an option for programme-critical projects.' })
  }
  const bcOverrunWks = Math.max(0, bcWks - s4Weeks)
  if (bcOverrunWks > 0) {
    stages.push({ stage: 'Building Control — wait', activity: 'Awaiting BC approval — tender on hold', weeks: bcOverrunWks,
      notes: `BC approval extends ${bcOverrunWks} wk(s) beyond Stage 4. Tender cannot start until approval received.` })
  }
  // Planning deciding alongside Stage 4 (Stage 3 already complete): tender
  // waits for whatever outlasts Stage 4 and any building-control wait.
  const planningLateWks = planningWks > 0 && s3Done ? Math.max(0, planningWks - s4Weeks - bcOverrunWks) : 0
  if (planningLateWks > 0) {
    stages.push({ stage: 'Planning — wait', activity: 'Awaiting LPA determination — tender on hold', weeks: planningLateWks,
      notes: `Planning determination extends ${planningLateWks} wk(s) beyond Stage 4. Tender cannot start until consent is received.` })
  }

  if (gw4 > 0) {
    stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 4', weeks: gw4, notes: 'Client sign-off' })
  }

  // ── Building Safety Act Gateway 2 (BS1, September 2026) ───────────────────
  // A higher-risk building cannot start construction until the Building
  // Safety Regulator approves the Gateway 2 application, which follows the
  // technical design. Sequential on the critical path between Stage 4 and
  // tender award; duration from the Durations row only (no row → no stage).
  let bsaWks = 0
  if (isHigherRiskBuilding(answers) && durTab['BS1']) {
    bsaWks = Math.ceil(dur('BS1', 0))
    if (bsaWks > 0) {
      stages.push({ stage: 'BSR Gateway 2', activity: 'Building Safety Regulator — Gateway 2 approval (higher-risk building)', weeks: bsaWks,
        notes: 'Statutory determination after technical design; construction cannot start without approval. Determinations frequently exceed the statutory period.' })
    }
  }

  // ── Tender / Procurement ──────────────────────────────────────────────────────
  const priorities = Array.isArray(answers.q4_4_priorities) ? answers.q4_4_priorities : []
  const primaryPriority = priorities[0] || ''

  // The Procurement Reference workbook decides (lib/procurementCalculator.js,
  // run by lib/pipeline.js before the final programme pass): its preferred
  // route to market sets the tender period (TN1–TN4, durations from this
  // workbook). Before that step — the pipeline's first pass, or a script that
  // passes no recommendation — the programme uses TN1, the workbook's formal
  // tender row, and says so (procurementSource 'provisional'). The code no
  // longer picks a route, contract or tender from the project value
  // (Programme v4.7): those value bands were the code's own numbers.
  const proc = opts.procurement?.preferred || null

  let tenderWks, procurementRoute, tenderNote, contractForm, tenderType
  let tenderId = 'TN1'
  if (proc) {
    const market = proc.routeToMarket
    tenderId         = /^TN[1234]$/.test(market?.tenderId) && durTab[market.tenderId] ? market.tenderId : 'TN1'
    tenderWks        = Math.round(dur(tenderId))
    procurementRoute = `${proc.route.name} — ${market?.name || 'route to market to be confirmed'}`
    contractForm     = proc.contract?.jct || ''
    tenderType       = market?.name || ''
    tenderNote = `${proc.route.name}, ${market?.name || 'tender'} — preferred option from the Procurement Reference (${tenderWks} weeks, ${tenderId})`
  } else {
    tenderWks        = Math.round(dur('TN1'))
    procurementRoute = durTab.TN1.activity || 'Tender'
    contractForm     = ''
    tenderType       = ''
    tenderNote       = `Provisional: ${durTab.TN1.activity || 'formal tender'} (${tenderWks} weeks, TN1) until the procurement suggestion is made`
  }
  const designResponsibility = '', procurementRationale = ''
  stages.push({ stage: 'Tender / Procurement', activity: procurementRoute, weeks: tenderWks, notes: tenderNote })

  // Design and build: the contractor carries Stage 4, so tender is issued on the
  // Stage 3 information and the technical design follows award. Showing a
  // completed client-side Stage 4 before a D&B tender is traditional
  // procurement. Same weeks, different order. Not applied when the client has
  // already completed Stage 4 (the design exists; it would be novated).
  const dbLate = !!proc && /design (and|&) build/i.test(proc.route?.name || '') && !s4Done
  if (dbLate) {
    const si = stages.findIndex(s => s.stage === 'Stage 4')
    const ti = stages.findIndex(s => s.stage === 'Tender / Procurement')
    if (si >= 0 && ti > si) {
      const [tender] = stages.splice(ti, 1)
      stages.splice(si, 0, tender)
      const s4 = stages.find(s => s.stage === 'Stage 4')
      s4.activity = 'Contractor design (design and build) — technical design after award'
      s4.notes = 'Stage 4 is carried by the contractor under design and build; the client reviews it at the gateway that follows.'
    }
  }
  // Mobilisation between award and start on site: only from a MOB1 row in the
  // Programme workbook's Durations sheet (no row, no stage — no duration is
  // invented in code).
  const mobWks = durTab['MOB1'] ? Math.ceil(dur('MOB1', 0)) : 0

  // ── Construction ──────────────────────────────────────────────────────────────
  const conId       = selectConstructionId(projectType, specLevel, scopeItems, answers.q1_2_storeys, answers.q1_3_buildingUse, appliedLevel, opts.scope?.meItemCount, new Set(Object.keys(conTab)))
  const conName     = conTab[conId]?.name || conId
  let   conWks      = conDur(conId)

  // Access uplift — applies highest applicable tier only (ACC-1 or ACC-2, not stacked)
  const accessUplift    = getAccessUplift(modTab, answers)
  // Occupation uplift from Modifiers sheet
  const occupationUplift = getOccupationUplift(modTab, occupation)

  // Phased delivery (Modifiers PH-1, "Sequential handovers extend site
  // duration") is an uplift on the whole construction period, like the two
  // above. It used to add a second full construction period plus 4 weeks of
  // re-mobilisation on top, so a phased project's construction more than
  // doubled (about 123 weeks where about 52 was right). The Construction sheet
  // duration is for the whole building, not for one phase.
  //
  // Occupation and phasing are not stacked (Programme v4.5): the higher of the
  // two applies. Working around occupants already means working in zones, and
  // the evidence agrees — Lakeside (occupied, six sections) ran about 10%
  // slower than vacant Riley Court, where the two multiplied gave +38%.
  //
  // Since October 2026 a phased project states how many phases (Q4.6a) and
  // the gap between them (Q4.6b). The construction period for the whole
  // building (with its uplifts) is shared equally between the phases and the
  // stated gaps are added between them; PH-1 is no longer applied. Phasing is
  // construction only — design, planning and tender run once. A report from
  // before the follow-up questions ("Multiple phases" alone) keeps PH-1.
  const phasingAnswer = answers.q4_6_phasing || 'Single phase'
  const phased        = phasingAnswer.toLowerCase().includes('multiple')
  const plan          = phasePlan(answers)
  const phasingValue  = phased && !plan ? modNumber(modTab, 'PH-1') : 0
  const phasingCovered = phasingValue > 0 && occupationUplift >= phasingValue
  const phasingUplift = phasingCovered ? 0 : phasingValue

  conWks = Math.ceil(conWks * (1 + accessUplift) * (1 + Math.max(occupationUplift, phasingUplift)))
  const phaseWorkWks = conWks
  const phaseGapTotal = plan ? (plan.count - 1) * plan.gapWeeks : 0
  conWks += phaseGapTotal

  const upliftNotes = []
  if (occupationUplift > 0) upliftNotes.push(`${Math.round(occupationUplift * 100)}% uplift for occupation`)
  if (accessUplift > 0 || occupationUplift > 0) upliftNotes.push(`${Math.round(accessUplift * 100)}% for access constraints`)
  if (phasingUplift > 0) upliftNotes.push(`${Math.round(phasingUplift * 100)}% for phased delivery`)
  const phaseWeeksEach = plan ? Math.round(phaseWorkWks / plan.count) : 0
  if (plan) upliftNotes.push(`${plan.count} phases of about ${phaseWeeksEach} weeks` +
    (plan.gapWeeks > 0 ? `, ${plan.gapWeeks} week(s) between phases` : ', no gap between phases'))
  const occupationNote = upliftNotes.join('; ')

  if (mobWks > 0) stages.push({ stage: 'Mobilisation', activity: 'Contract award to start on site — mobilisation, site set-up and long-lead orders', weeks: mobWks, notes: 'Between contract award and start on site' })
  stages.push({ stage: 'Construction', activity: `RIBA Stage 5 — ${conName}${plan ? ` (${plan.count} phases)` : ''}`, weeks: conWks,
    notes: occupationNote || 'Full decant / vacant — no uplift' })

  // ── Handover ──────────────────────────────────────────────────────────────────
  const hoWks = Math.ceil(conDur('CH1'))
  const handoverStage = { stage: 'Handover', activity: 'RIBA Stage 6 — Snagging, Practical Completion and move-in', weeks: hoWks,
    notes: 'Defects liability period begins at Practical Completion' }

  const phasingNote = plan
    ? `Construction in ${plan.count} phases of about ${phaseWeeksEach} weeks each` +
      (plan.gapWeeks > 0
        ? `, with ${plan.gapWeeks} week(s) between phases as stated (${phaseGapTotal} weeks in all)`
        : ', one straight after another as stated') +
      `: ${conWks} weeks of construction. Phases are assumed equal in size; design, planning and tender run once for the whole project. Phase split to be confirmed at Stage 2.`
    : phasingUplift > 0
    ? `Multiple phases: the ${conWks}-week construction period covers every phase, including ${aOrAn(Math.round(phasingUplift * 100), false)} ${Math.round(phasingUplift * 100)}% uplift (Modifiers PH-1) for sequential handovers and re-mobilisation. Phase split to be confirmed at Stage 2.`
    : phasingCovered
      ? `Multiple phases: the ${conWks}-week construction period covers every phase. The occupation uplift already allows for working in zones, so no separate phasing uplift is added. Phase split to be confirmed at Stage 2.`
      : ''

  // ── Funding governance — read from Modifiers FN-1 ────────────────────────────
  const fundingSource      = answers.q4_7_funding || ''
  let grantGovernanceWks   = 0
  let procurementNote      = ''
  if (fundingSource.toLowerCase().includes('grant') || fundingSource.toLowerCase().includes('public')) {
    grantGovernanceWks = getGrantGovernanceWeeks(modTab)
    procurementNote    = 'Grant or public funding — formal competitive procurement required regardless of value.'
    // Modifiers FN-1 applies to "Procurement/Pre-start": governance approval
    // happens before the tender is committed, which is also where the
    // milestones have always counted it. It used to be appended after
    // handover in the stage list, so once calendar dates were added the row
    // sat in the wrong year. Inserted before Tender so the two agree.
    const tenderIdx = stages.findIndex(s => s.stage === 'Tender / Procurement')
    const govStage = { stage: 'Governance', activity: 'Grant governance approval', weeks: grantGovernanceWks, notes: procurementNote }
    if (tenderIdx >= 0) stages.splice(tenderIdx, 0, govStage)
    else stages.push(govStage)
  }

  // ── Construction window (Q3.5a, October 2026) ─────────────────────────────
  // Works limited to holidays, or stopped / allowed between set dates: the
  // construction weeks are fitted into the allowed weeks from the week the
  // build would start, so the construction stage is the elapsed time on site.
  // Q4.2a / Q4.2b blackouts. A report from before them (no Q4.2a answer) keeps
  // its Q3.5a window; once Q4.2a is answered it is the only source, so an old
  // Q3.5 tick can never contradict it.
  const workWin = answers.q4_2a_blackout ? blackoutPlan(answers, restrictions) : workWindow(answers)
  let workWindowNote = ''
  let windowWaitWks = 0
  if (workWin) {
    const preConWks = mobWks + s2Weeks + gw2 + s3Weeks + gw3 + s4Weeks + gw4 + planningOverrunWks +
      bcOverrunWks + planningLateWks + bsaWks + tenderWks + grantGovernanceWks
    const rawStartW = String(answers.q4_0_startDate || '').trim()
    const startW = /^\d{4}-\d{2}-\d{2}$/.test(rawStartW) ? new Date(rawStartW + 'T00:00:00Z') : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
    const fit = scheduleInWindow(startW, preConWks, conWks, workWin, holidayRanges(modTab))
    const conStage = stages.find(s => s.stage === 'Construction')
    if (fit.noCalendar) {
      workWindowNote = 'Works are limited to school holidays, but the programme workbook holds no holiday calendar, so construction is shown as continuous.'
    } else {
      const what = workWin.type === 'blackout' ? `the weeks outside the restricted periods (${workWin.labels.map(l => l.charAt(0).toLowerCase() + l.slice(1)).join('; ')})`
        : workWin.type === 'holidays' ? 'school holidays'
        : workWin.type === 'except' ? 'the weeks outside the stated stop periods' : 'the stated work periods'
      workWindowNote = `${conWks} weeks of construction fitted into ${what}: ${fit.elapsed} weeks from start on site to finish` +
        (fit.wait > 0 ? `, after a ${fit.wait}-week wait for the first window.` : '.') +
        (fit.short > 0 ? ` The stated periods hold only ${fit.worked} of the ${conWks} weeks needed; more time must be found.` : '') +
        (workWin.type === 'blackout' ? ' All site works are assumed to stop during these periods; at Stage 2 the design team should confirm which works must stop, which usually shortens the programme.' : '')
      conWks = Math.max(fit.elapsed, 1)
      windowWaitWks = fit.wait
      if (conStage) {
        conStage.weeks = conWks
        conStage.notes = [conStage.notes, workWindowNote].filter(Boolean).join('; ')
        if (windowWaitWks > 0) {
          stages.splice(stages.indexOf(conStage), 0, { stage: 'Work window — wait', activity: `Waiting for the first allowed construction week (${what})`, weeks: windowWaitWks,
            notes: 'Contractor appointed; start on site held until the work window opens' })
        }
      }
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────────────
  // Surveys run concurrently with design (do not extend total); planningOverrun and bcOverrun are sequential waits
  const designWeeks = s2Weeks + gw2 + s3Weeks + gw3 + s4Weeks + gw4
  const criticalPathWeeks = mobWks + designWeeks + planningOverrunWks + bcOverrunWks + planningLateWks + bsaWks + tenderWks + windowWaitWks + conWks + hoWks + grantGovernanceWks

  // ── Programme float (Modifiers PROG-FLOAT) ─────────────────────────────────
  // The workbook has always carried "+1 wk per 13 wks — report a best-case (no
  // float) and a with-float programme", but the code never applied it, so the
  // single headline number was the optimistic one. The headline is now the
  // with-float figure (the conservative one a client should plan around) and
  // the best case is reported alongside it. Everything downstream that reads
  // totalWeeks — inflation bands, the target-date check — sees the float.
  const floatEvery  = getFloatEveryWeeks(modTab)
  const floatWeeks  = floatEvery > 0 ? Math.ceil(criticalPathWeeks / floatEvery) : 0
  const totalWeeksBestCase = criticalPathWeeks
  const totalWeeks  = criticalPathWeeks + floatWeeks
  if (floatWeeks > 0) {
    stages.push({ stage: 'Programme float', activity: 'Float / contingency across the critical path', weeks: floatWeeks,
      notes: `${floatWeeks} wk(s) at 1 week per ${floatEvery} weeks of critical path (Modifiers PROG-FLOAT). Best case without float: ${totalWeeksBestCase} weeks.` })
  }
  // Float sits before Practical Completion (the handover stage ends the programme).
  stages.push(handoverStage)

  // ── FastTrack levers (offered, never applied) ──────────────────────────────
  // FT1 (start point) is already applied above. Each remaining lever's trigger
  // is evaluated deterministically here from the same answers; the ones that
  // fire are listed in the report as options with their trade-off. The
  // headline programme is never shortened by them — that is the client's call.
  const wantsSpeed   = priorities.some(p => String(p).toLowerCase().includes('speed'))
  const wantsQuality = priorities.some(p => String(p).toLowerCase().includes('design quality'))
  const surveysHeld  = (Array.isArray(answers.q3_3_surveys) ? answers.q3_3_surveys : []).map(s => String(s).toLowerCase())
  const surveyStageNames = stages.filter(s => s.parallel && /survey|investigation/i.test(s.stage)).map(s => s.stage.toLowerCase())
  const surveyMatch = surveysHeld.some(h =>
    surveyStageNames.some(n =>
      (h.includes('asbestos') && n.includes('asbestos')) ||
      (h.includes('structural') && n.includes('structural')) ||
      (h.includes('condition') && n.includes('condition')) ||
      (h.includes('topographic') && n.includes('topographic')) ||
      (h.includes('ground') && n.includes('ground'))))
  const FT_TRIGGERS = {
    FT2:  () => surveyMatch,
    FT3:  () => wantsSpeed && planningRequired && !s3Done,
    // With a Procurement Reference recommendation, a lever that names a route
    // is offered only when that route is one of the two options the report
    // gives (the prose may not name any other): FT4 (framework) when the
    // preferred tender is a formal tender and the alternative is a framework,
    // FT10 (two-stage PCSA) when two-stage is the preferred or alternative route.
    FT4:  () => proc
      ? wantsSpeed && tenderId === 'TN1' && opts.procurement?.alternative?.routeToMarket?.tenderId === 'TN3'
      : wantsSpeed && tenderWks > 0,
    FT5:  () => wantsSpeed && bcRequired && !s4Done,
    FT6:  () => wantsSpeed && hasDemo,
    FT7:  () => meHeavy || hasSpecialist,
    FT8:  () => wantsSpeed && (gw2 + gw3 + gw4) > 0,
    FT9:  () => pl.includes('permitted development'),
    FT10: () => wantsSpeed && wantsQuality && (!proc ||
      [opts.procurement?.preferred, opts.procurement?.alternative].some(o => /two.stage/i.test(o?.route?.name || ''))),
  }
  const fastTrackOptions = ftTab
    .filter(l => l.id !== 'FT1' && FT_TRIGGERS[l.id] && FT_TRIGGERS[l.id]())
    .map(l => ({ id: l.id, lever: l.lever, action: l.action, weeksSaved: l.weeksSaved, tradeOff: l.tradeOff }))

  // ── Programme start date and calendar dates (September 2026) ───────────────
  // Q4.0 gives the start; absent, the generation date is assumed (and said so).
  // Sequential stages run back to back; parallel stages are anchored to the
  // stage they run alongside (surveys at week 0, planning with Stage 3,
  // building control with Stage 4). Dates are ISO strings so both renderers
  // format them identically via lib/reportShared.js.
  const rawStart = String(answers.q4_0_startDate || '').trim()
  const parsedStart = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? new Date(rawStart + 'T00:00:00Z') : null
  const startDateAssumed = !parsedStart || Number.isNaN(parsedStart.getTime())
  const startDate = startDateAssumed ? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') : parsedStart
  const isoAtWeek = w => new Date(startDate.getTime() + w * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const fmtWeekDate = w => new Date(isoAtWeek(w) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  {
    let cursor = 0
    const startOf = {}
    for (const s of stages) {
      if (s.parallel) continue
      s.startWeek = cursor
      s.endWeek = cursor + (s.weeks || 0)
      startOf[s.stage] = s.startWeek
      cursor = s.endWeek
    }
    for (const s of stages) {
      if (!s.parallel) continue
      const anchor = /planning/i.test(s.stage) ? (startOf[planningAlongside] ?? 0)
        : /building control/i.test(s.stage) ? (startOf['Stage 4'] ?? 0)
        : 0
      s.startWeek = anchor
      s.endWeek = anchor + (s.weeks || 0)
    }
    for (const s of stages) {
      s.startDate = isoAtWeek(s.startWeek)
      s.endDate = isoAtWeek(s.endWeek)
    }
  }

  // ── Target date feasibility ───────────────────────────────────────────────────
  let targetStatus = 'no-date'
  let targetNote   = 'No target completion date has been specified.'
  const targetDate = answers.q4_1_targetDate

  if (targetDate && targetDate !== 'No specific deadline') {
    const target   = new Date(targetDate)
    const earliest = new Date(startDate)
    earliest.setDate(earliest.getDate() + totalWeeks * 7)
    if (target >= earliest) {
      targetStatus = 'achievable'
      const bufferWeeks = Math.round((target - earliest) / (7 * 24 * 3600 * 1000))
      targetNote = `The target date of ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} is achievable from ${startDateAssumed ? 'an assumed' : 'a stated'} start of ${fmtWeekDate(0)}, with a programme buffer of approximately ${bufferWeeks} weeks.`
    } else {
      targetStatus = 'at-risk'
      const shortfallWeeks = Math.round((earliest - target) / (7 * 24 * 3600 * 1000))
      targetNote = `The target date of ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} is not achievable from ${startDateAssumed ? 'an assumed' : 'a stated'} start of ${fmtWeekDate(0)}. The ${totalWeeks}-week programme completes around ${fmtWeekDate(totalWeeks)}, approximately ${shortfallWeeks} weeks beyond the target.`
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────────────
  // Completed design stages (FT1) are omitted — only milestones for work that is
  // actually in the programme are shown. The opening milestone names the first
  // remaining stage.
  const startStageLabel = !s2Done ? 'Stage 2 commences'
    : !s3Done ? 'Stage 3 commences (Stage 2 already complete)'
    : !s4Done ? (dbLate ? 'Tender commences (Stages 2–3 already complete; design and build)' : 'Stage 4 commences (Stages 2–3 already complete)')
    : 'Tender commences (design already complete)'
  const milestones = [
    surveyWeeks > 0 && !s2Done
      ? `Week 0: Project Start — ${startStageLabel}; pre-design surveys commissioned in parallel`
      : `Week 0: Project Start — ${startStageLabel}`
  ]
  if (surveyWeeks > 0 && !s2Done) milestones.push(`Week ${surveyWeeks}: Pre-design surveys complete (concurrent with Stage 2)`)
  let w = 0
  w += s2Weeks
  if (!s2Done) milestones.push(`Week ${w}: Stage 2 Concept Design complete`)
  w += gw2 + s3Weeks
  if (!s3Done) milestones.push(`Week ${w}: Stage 3 Developed Design complete${planningRequired ? ' — Planning decision expected' : ''}`)
  if (dbLate) {
    // Design and build: tender on the Stage 3 information; the contractor then
    // carries Stage 4 (and any building-control or planning wait) before site.
    w += planningOverrunWks + gw3 + grantGovernanceWks
    milestones.push(`Week ${w}: Stage 3 information complete — Tender issued (design and build)`)
    w += tenderWks
    milestones.push(`Week ${w}: Contractor appointed — contractor design (Stage 4) commences`)
    w += s4Weeks + bcOverrunWks + planningLateWks + gw4
    milestones.push(`Week ${w}: Contractor's Stage 4 Technical Design complete`)
    if (bsaWks > 0) {
      w += bsaWks
      milestones.push(`Week ${w}: Gateway 2 approval — Building Safety Regulator`)
    }
  } else {
    w += planningOverrunWks + gw3 + s4Weeks + bcOverrunWks + planningLateWks + gw4 + grantGovernanceWks
    if (bsaWks > 0) {
      milestones.push(`Week ${w}: Stage 4 Technical Design complete — Gateway 2 application submitted to the Building Safety Regulator`)
      w += bsaWks
      milestones.push(`Week ${w}: Gateway 2 approval — Tender issued`)
    } else if (!s4Done) milestones.push(`Week ${w}: Stage 4 Technical Design complete — Tender issued`)
    else milestones.push(`Week ${w}: Tender issued`)
    w += tenderWks
    milestones.push(`Week ${w}: Contractor appointed${mobWks > 0 ? ' — mobilisation begins' : ' — construction commences'}`)
  }
  if (mobWks > 0) {
    w += mobWks
    milestones.push(`Week ${w}: Start on site`)
  }
  w += conWks + floatWeeks + hoWks
  milestones.push(`Week ${w}: Practical Completion${floatWeeks > 0 ? ` (earliest Week ${w - floatWeeks}; ${floatWeeks} weeks float included)` : ''}`)
  milestones.push(`Week ${w}: Project Close-out — Defects liability period begins`)

  milestones.sort((a, b) => {
    const wa = parseInt(a.match(/^Week (\d+)/)?.[1] ?? '0', 10)
    const wb = parseInt(b.match(/^Week (\d+)/)?.[1] ?? '0', 10)
    return wa - wb
  })
  // "Week 12: …" → "Week 12 (7 Dec 2026): …" — dates from the Q4.0 start.
  for (let i = 0; i < milestones.length; i++) {
    milestones[i] = milestones[i].replace(/^Week (\d+):/, (_, n) => `Week ${n} (${fmtWeekDate(Number(n))}):`)
  }

  const assumptions = buildProgrammeAssumptions(answers, {
    totalWeeks, constructionWeeks: conWks, procurementRoute,
    tenderWeeks: tenderWks, occupationUplift, accessUplift,
    planningRequired, bcRequired, surveyWeeks, s2Done, startStageLabel,
    floatWeeks, floatEvery, totalWeeksBestCase, primaryPriority,
    startDateAssumed, startLabel: fmtWeekDate(0), proc, tenderId,
  })
  if (bsaWks > 0) assumptions.push(`Higher-risk building (Q3.8): ${aOrAn(bsaWks, false)} ${bsaWks}-week Building Safety Regulator Gateway 2 approval period is included on the critical path between technical design and tender. This is the statutory minimum; recent determinations have commonly taken longer, and the programme should be re-based once the BSR's current performance is known.`)
  if (stages.some(s => s.stage === 'Ecology Survey')) assumptions.push('An ecology / bat survey is shown in parallel with early design. Emergence surveys can only be carried out between May and September; if the project start falls outside that window the survey, and any licence it leads to, can delay works by up to a year.')
  // Surface the FT1 start-point decision at the top of the assumptions list.
  if (programmeStartNote) assumptions.unshift(programmeStartNote)

  return {
    stages,
    totalWeeks,
    totalWeeksBestCase,
    floatWeeks,
    startDate: isoAtWeek(0),
    startDateAssumed,
    endDate: isoAtWeek(totalWeeks),
    fastTrackOptions,
    tenderType,
    designResponsibility,
    procurementRationale,
    procurementSource: proc ? 'Procurement Reference' : 'provisional',
    tenderId,
    surveyWeeks,
    // How the report should describe planning: a determination alongside a
    // stage, consent taken as held (Stage 4 complete), or none needed.
    planningStatus: planningWks > 0 ? 'determination' : planningRequired && s4Done ? 'held' : 'none',
    planningAlongside: planningWks > 0 ? planningAlongside : null,
    designWeeks,
    tenderWeeks: tenderWks,
    constructionWeeks: conWks,
    handoverWeeks: hoWks,
    planningWeeks: planningWks,
    bcWeeks: bcWks,
    bsaGatewayWeeks: bsaWks,
    bcOverrunWeeks: bcOverrunWks,
    planningOverrunWeeks: planningOverrunWks + planningLateWks,
    targetStatus,
    targetNote,
    procurementRoute,
    contractForm,
    milestones,
    assumptions,
    standardAssumptions: assumptions,
    occupationUplift: Math.round(occupationUplift * 100),
    accessUplift: Math.round(accessUplift * 100),
    constructionType: conName,
    grantGovernanceWeeks: grantGovernanceWks,
    procurementNote,
    phasingNote,
    workWindowNote,
    workWindow: workWin,
    phasingUplift: Math.round(phasingUplift * 100),
    phaseCount: plan ? plan.count : 1,
    phaseGapWeeks: plan ? plan.gapWeeks : 0,
    phaseWeeks: plan ? phaseWeeksEach : null,
    designMultiplier,
    sizeBandUsed: band,
    programmeBenchmark: benchmarks[band],
    workbookVersion: parseWorkbookVersion(wb),
    programmeStartNote,
  }
}
