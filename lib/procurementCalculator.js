/**
 * procurementCalculator.js — deterministic procurement recommendation.
 *
 * Driven by the Procurement Reference workbook (PROCUREMENT_FILE_URL,
 * `Projento_Procurement_Reference.xlsx`), the same way the cost and programme
 * engines are driven by theirs: the workbook decides, this file applies it,
 * and the AI only writes prose about what was selected. The rules are the
 * workbook's own '0. Read Me' — keep the two in step.
 *
 * Four drivers (value · duration · risk · client top priority) set a level
 * each; every option on '2. Options' scores 0 / 1 / 2 / X at those levels
 * (X drops it), weighted by '1. Drivers'. The best two procurement routes,
 * the best commercial model for each, the contract for each route + model
 * ('3. Contracts') and the best two routes to market come back as Preferred
 * and Alternative.
 *
 * Sheets are read by name and columns by header text; '0. Read Me' and
 * '4. Check' (a formula test tab) are ignored.
 */
import * as XLSX from 'xlsx'
import { PRIORITY_OPTIONS, topPriority, publicClient } from './questionSets.js'

let _cache = { wb: null, fetchedAt: 0 }
let _inflight = null

// Shared with /api/rates-check; callers arriving during a download share it.
export async function fetchProcurementWorkbook() {
  if (_cache.wb && Date.now() - _cache.fetchedAt < 10 * 60 * 1000) return _cache.wb
  _inflight ??= downloadProcurementWorkbook().finally(() => { _inflight = null })
  return _inflight
}

async function downloadProcurementWorkbook() {
  const now = Date.now()
  const url = process.env.PROCUREMENT_FILE_URL
  if (!url) throw new Error('PROCUREMENT_FILE_URL environment variable not set')
  let bytes
  try {
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      bytes = new Uint8Array(await res.arrayBuffer())
    } else {
      // A local path — tests and local verification only, like RATES_FILE_URL.
      const { readFile } = await import('node:fs/promises')
      bytes = new Uint8Array(await readFile(url))
    }
  } catch (e) {
    throw new Error(`Could not load the Procurement Reference workbook (${e.message})`)
  }
  const wb = XLSX.read(bytes, { type: 'array' })
  parseProcurementWorkbook(wb) // reject a bad file before it is cached
  _cache = { wb, fetchedAt: now }
  return wb
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

const SHEETS = { drivers: '1. Drivers', options: '2. Options', contracts: '3. Contracts' }
const OUTPUT_BY_PREFIX = { PR: 'route', CM: 'model', RM: 'market' }
const CLIENTS = ['All', 'Public only', 'Private only']
const SCORES = new Set(['0', '1', '2', 'X'])

// Labels compare without case, spacing or spaces around "/": the questionnaire
// says "Fixed / certain final cost" where the workbook says "Fixed/certain final
// cost", and saved drafts and NRM1 condition text both quote the app's form.
export function normaliseLabel(s) {
  return String(s ?? '').toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim()
}

function fail(msg) {
  throw new Error(`Procurement Reference workbook: ${msg}`)
}

function sheetRows(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) fail(`missing sheet '${name}'`)
  // A formula saved without its value means the file was written by a tool
  // that does not recalculate (the brief's D4 / D28 check, for every cell).
  for (const [addr, cell] of Object.entries(ws)) {
    if (addr[0] === '!' || !cell?.f) continue
    if (cell.v === undefined || cell.v === null || cell.v === '')
      fail(`'${name}'!${addr} is a formula with no saved value — open the file in Excel and save it again`)
  }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
}

// The header row is the first whose column A reads `first`; columns are found
// by the start of their header text (a "(…)" note after it is ignored).
function headerIndex(rows, first, sheet) {
  const i = rows.findIndex(r => normaliseLabel(r[0]).startsWith(normaliseLabel(first)))
  if (i < 0) fail(`'${sheet}' has no header row starting "${first}"`)
  return i
}

function col(header, start, sheet, { required = true } = {}) {
  const i = header.findIndex(h => normaliseLabel(h).startsWith(normaliseLabel(start)))
  if (i < 0 && required) fail(`'${sheet}' has no "${start}" column`)
  return i
}

const cellText = v => String(v ?? '').trim()

function parseDrivers(wb) {
  const name = SHEETS.drivers
  const rows = sheetRows(wb, name)
  const h = headerIndex(rows, 'Driver', name)
  const header = rows[h]
  const cDriver = col(header, 'Driver', name)
  const cCode = col(header, 'Code', name)
  const cLevel = col(header, 'Level', name)
  const cFrom = col(header, 'From', name)
  const cAnswer = col(header, 'Questionnaire answer', name)

  const byDriver = {}
  let r = h + 1
  for (; r < rows.length && cellText(rows[r][cDriver]); r++) {
    const row = rows[r]
    const driver = cellText(row[cDriver])
    const level = cellText(row[cLevel])
    if (!level) fail(`'${name}' row ${r + 1} has no level name`)
    ;(byDriver[driver] ??= []).push({
      code: cellText(row[cCode]),
      level,
      from: row[cFrom] === '' ? null : Number(row[cFrom]),
      answer: cellText(row[cAnswer]),
      row: r + 1,
    })
  }

  const drivers = {}
  for (const [key, label] of [['value', 'Value'], ['duration', 'Duration'], ['risk', 'Risk'], ['priority', 'Client top priority']]) {
    const list = byDriver[label]
    if (!list?.length) fail(`'${name}' has no "${label}" driver rows`)
    if (key !== 'priority') {
      for (const l of list) if (!Number.isFinite(l.from)) fail(`'${name}' row ${l.row} (${l.level}) has no 'From' value`)
      list.sort((a, b) => a.from - b.from)
    }
    drivers[key] = list
  }

  // Weights: "Weight — <driver>" rows, the figure in the 'From' column (D).
  const weights = {}
  const threshold = {}
  for (const row of rows.slice(r)) {
    const a = cellText(row[0])
    const m = a.match(/^weight\s*[—–-]\s*(.+)$/i)
    if (m) {
      const key = { value: 'value', duration: 'duration', risk: 'risk', 'client top priority': 'priority' }[normaliseLabel(m[1])]
      const w = Number(row[cFrom])
      if (key && Number.isFinite(w)) weights[key] = w
    }
    if (/^works threshold/i.test(a)) {
      const v = Number(row[cFrom])
      if (!Number.isFinite(v) || v <= 0) fail(`'${name}' "${a}" has no value`)
      if (/incl/i.test(a)) threshold.inclVat = v
      else if (/excl/i.test(a)) threshold.exclVat = v
    }
  }
  for (const k of ['value', 'duration', 'risk', 'priority'])
    if (!Number.isFinite(weights[k])) fail(`'${name}' is missing its "Weight — ${k}" row`)
  if (!threshold.inclVat || !threshold.exclVat) fail(`'${name}' is missing a works threshold row`)

  // Every Q4.4 option must find its priority level, or that answer would
  // silently score nothing for priority.
  for (const opt of PRIORITY_OPTIONS) {
    if (!drivers.priority.some(p => normaliseLabel(p.answer) === normaliseLabel(opt)))
      fail(`no Client top priority row for the questionnaire's "${opt}"`)
  }
  return { drivers, weights, threshold }
}

function parseOptions(wb, drivers) {
  const name = SHEETS.options
  const rows = sheetRows(wb, name)
  const h = headerIndex(rows, 'ID', name)
  const header = rows[h]
  const c = {
    id: col(header, 'ID', name),
    output: col(header, 'Output', name),
    option: col(header, 'Option', name),
    whatItIs: col(header, 'What it is', name),
    bestWhen: col(header, 'Best when', name),
    watchOuts: col(header, 'Watch-outs', name),
    worksWith: col(header, 'Works with routes', name),
    client: col(header, 'Client', name),
    // Optional: which Programme workbook tender period (TN1–TN3) a route to
    // market takes. Absent → tenderIdFor() below.
    tender: col(header, 'Tender period', name, { required: false }),
  }
  const scoreCol = {}
  for (const list of Object.values(drivers)) {
    for (const l of list) {
      const i = header.findIndex(x => cellText(x) === l.level)
      if (i < 0) fail(`'${name}' has no score column headed "${l.level}" (level names on '${SHEETS.drivers}' must match exactly)`)
      scoreCol[l.level] = i
    }
  }

  const options = []
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r]
    const id = cellText(row[c.id]).toUpperCase()
    if (!id) break // a footnote row sits below the table
    const kind = OUTPUT_BY_PREFIX[id.slice(0, 2)]
    if (!kind) fail(`'${name}' row ${r + 1}: unknown ID "${id}" (expected PR…, CM… or RM…)`)
    const client = cellText(row[c.client]) || 'All'
    if (!CLIENTS.includes(client)) fail(`'${name}' ${id}: Client must be All, Public only or Private only (found "${client}")`)
    const scores = {}
    for (const [level, i] of Object.entries(scoreCol)) {
      const s = cellText(row[i]).toUpperCase()
      if (!SCORES.has(s)) fail(`'${name}' ${id}: score for "${level}" must be 0, 1, 2 or X (found "${cellText(row[i])}")`)
      scores[level] = s === 'X' ? 'X' : Number(s)
    }
    const tender = c.tender >= 0 ? cellText(row[c.tender]).toUpperCase() : ''
    if (tender && !/^TN[1-3]$/.test(tender)) fail(`'${name}' ${id}: Tender period must be TN1, TN2 or TN3 (found "${tender}")`)
    options.push({
      id, kind, index: options.length,
      name: cellText(row[c.option]),
      whatItIs: cellText(row[c.whatItIs]),
      bestWhen: cellText(row[c.bestWhen]),
      watchOuts: cellText(row[c.watchOuts]),
      worksWith: cellText(row[c.worksWith]).split(';').map(s => s.trim().toUpperCase()).filter(Boolean),
      client,
      scores,
      tenderId: tender || null,
    })
  }
  const ids = new Set()
  for (const o of options) {
    if (ids.has(o.id)) fail(`'${name}' lists ${o.id} twice`)
    ids.add(o.id)
  }
  for (const o of options) {
    if (o.kind !== 'model') continue
    if (!o.worksWith.length) fail(`'${name}' ${o.id} has no 'Works with routes'`)
    for (const r of o.worksWith)
      if (!options.some(x => x.kind === 'route' && x.id === r)) fail(`'${name}' ${o.id} works with unknown route "${r}"`)
  }
  for (const kind of ['route', 'model', 'market'])
    if (!options.some(o => o.kind === kind)) fail(`'${name}' has no ${kind} options`)
  return options
}

function parseContracts(wb, valueLevels) {
  const name = SHEETS.contracts
  const rows = sheetRows(wb, name)
  const h = headerIndex(rows, 'Key', name)
  const header = rows[h]
  const cKey = col(header, 'Key', name)
  const cNec = col(header, 'NEC4', name)
  const cNotes = col(header, 'Notes', name)
  // One JCT column per value level: "JCT — V1 under £1m", "JCT — V3/V4 above
  // threshold" — the column whose header names the level's code.
  const jctCol = {}
  for (const l of valueLevels) {
    const re = new RegExp(`\\b${l.code}\\b`, 'i')
    const i = header.findIndex(x => /^jct/i.test(cellText(x)) && re.test(cellText(x)))
    if (i < 0) fail(`'${name}' has no JCT column for value level ${l.code}`)
    jctCol[l.code] = i
  }
  const contracts = {}
  for (let r = h + 1; r < rows.length; r++) {
    const key = cellText(rows[r][cKey]).toUpperCase().replace(/\s+/g, '')
    if (!key) break
    const jct = {}
    for (const [code, i] of Object.entries(jctCol)) jct[code] = cellText(rows[r][i])
    contracts[key] = { jct, nec4: cellText(rows[r][cNec]), notes: cellText(rows[r][cNotes]) }
  }
  return contracts
}

function parseVersion(wb) {
  const ws = wb.Sheets['0. Read Me']
  if (!ws) return null
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const row = rows.find(r => normaliseLabel(r[0]) === 'version')
  const v = String(row?.[1] || '').match(/^\s*([\d.]+)/)?.[1]
  return v ? `Procurement Reference v${v}` : null
}

// The contract-form abbreviations and NEC4 options the workbook uses ("MW",
// "SBC/AQ", "PCSA", "ECSC", "Option C", "X22"). lib/prose.js checks the AI
// text against the ones outside the two recommended contracts.
export function tokensIn(text) {
  const t = String(text || '')
  return [...new Set([
    ...[...t.matchAll(/\b[A-Z]{2,}(?:\/[A-Z]+)*\b/g)].map(m => m[0]),
    ...[...t.matchAll(/\bOption ([A-F])\b/g)].map(m => `Option ${m[1]}`),
    ...[...t.matchAll(/\bX\d{1,2}\b/g)].map(m => m[0]),
  ])]
}

function contractTokens(contracts) {
  const all = Object.values(contracts).flatMap(c => [...Object.values(c.jct), c.nec4, c.notes])
  return tokensIn(all.join(' ; '))
}

const _parsed = new WeakMap()

/** The workbook as tables; throws on anything the selection could not use. */
export function parseProcurementWorkbook(wb) {
  let model = _parsed.get(wb)
  if (!model) {
    const { drivers, weights, threshold } = parseDrivers(wb)
    const options = parseOptions(wb, drivers)
    const contracts = parseContracts(wb, drivers.value)
    // Every route + model pair the selection can reach must have a contract.
    for (const m of options.filter(o => o.kind === 'model'))
      for (const r of m.worksWith)
        if (!contracts[`${r}|${m.id}`]) fail(`'${SHEETS.contracts}' has no row for ${r}|${m.id}`)
    model = { drivers, weights, threshold, options, contracts, contractTokens: contractTokens(contracts), version: parseVersion(wb) }
    _parsed.set(wb, model)
  }
  return model
}

// ─── Selection ───────────────────────────────────────────────────────────────

/** The highest level whose 'From' the figure reaches. */
export function levelFor(levels, x) {
  const n = Number(x) || 0
  let hit = levels[0]
  for (const l of levels) if (n >= l.from) hit = l
  return hit
}

// Tender period when the workbook has no 'Tender period' column: the Programme
// workbook's TN2 is "Three Quotations", TN3 "Framework / Call-Off" and TN1
// "Formal Competitive" (open, selective and negotiated tenders).
function tenderIdFor(market) {
  if (market.tenderId) return market.tenderId
  if (/quotation/i.test(market.name)) return 'TN2'
  if (/framework/i.test(market.name)) return 'TN3'
  return 'TN1'
}

function rank(list) {
  return list
    .filter(o => o.score != null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
}

/**
 * Pure selection over a parsed workbook.
 * @param {object} input { valueGBP, weeks, highRisks, priority, publicClient }
 *   priority is the Q4.4 label ('' / null → the priority term is left out);
 *   publicClient is true / false / null (unknown → both client-only kinds out).
 */
export function selectProcurement(model, input) {
  const { drivers, weights, options, contracts } = model
  const value = levelFor(drivers.value, input.valueGBP)
  const duration = levelFor(drivers.duration, input.weeks)
  const risk = levelFor(drivers.risk, input.highRisks)
  const pKey = normaliseLabel(input.priority)
  const priority = pKey ? drivers.priority.find(p => normaliseLabel(p.answer) === pKey) || null : null
  const pub = input.publicClient === true ? true : input.publicClient === false ? false : null

  const terms = [[value, weights.value], [duration, weights.duration], [risk, weights.risk]]
  if (priority) terms.push([priority, weights.priority])
  const maxScore = terms.reduce((a, [, w]) => a + 2 * w, 0)

  const clientOk = o => o.client === 'All'
    || (o.client === 'Public only' && pub === true)
    || (o.client === 'Private only' && pub === false)

  const scored = options.map(o => {
    if (!clientOk(o)) return { ...o, score: null, excluded: 'client' }
    let score = 0
    for (const [level, w] of terms) {
      const s = o.scores[level.level]
      if (s === 'X') return { ...o, score: null, excluded: level.level }
      score += s * w
    }
    return { ...o, score }
  })

  const routes = rank(scored.filter(o => o.kind === 'route'))
  const markets = rank(scored.filter(o => o.kind === 'market'))
  if (!routes.length) fail('no procurement route is suitable at these driver levels')
  if (!markets.length) fail('no route to market is suitable at these driver levels')

  const bestModel = route => {
    // Exact ID match on the split list — "PR1" must never match "PR10".
    const m = rank(scored.filter(o => o.kind === 'model' && o.worksWith.includes(route.id)))[0]
    if (!m) fail(`no commercial model is suitable for ${route.id} at these driver levels`)
    return m
  }
  const contractFor = (route, m) => {
    const key = `${route.id}|${m.id}`
    const c = contracts[key]
    if (!c) fail(`'${SHEETS.contracts}' has no row for ${key}`)
    return { key, jct: c.jct[value.code] || '', nec4: c.nec4, notes: c.notes }
  }
  const pick = o => o && ({ id: o.id, name: o.name, score: o.score, whatItIs: o.whatItIs, bestWhen: o.bestWhen, watchOuts: o.watchOuts })
  const pair = (route, market) => {
    if (!route) return null
    const m = bestModel(route)
    return {
      route: pick(route),
      model: pick(m),
      contract: contractFor(route, m),
      routeToMarket: market ? { ...pick(market), tenderId: tenderIdFor(market) } : null,
    }
  }

  return {
    drivers: {
      valueGBP: Math.round(Number(input.valueGBP) || 0), valueLevel: value.level,
      weeks: Number(input.weeks) || 0, durationLevel: duration.level,
      highRisks: Number(input.highRisks) || 0, riskLevel: risk.level,
      priority: priority ? priority.answer : null, priorityLevel: priority ? priority.level : null,
      publicClient: pub,
    },
    preferred: pair(routes[0], markets[0]),
    alternative: pair(routes[1], markets[1]),
    maxScore,
    thresholdInclVat: model.threshold.inclVat,
    // Every option and contract token in the workbook, so the prose check can
    // tell a name that was not recommended from ordinary words.
    vocabulary: {
      options: options.map(o => ({ id: o.id, kind: o.kind, name: o.name })),
      contractTokens: model.contractTokens,
    },
    workbookVersion: model.version,
  }
}

/**
 * The recommendation for a report.
 * @param {object} answers  questionnaire answers (top priority, public client)
 * @param {object} d        { valueGBP, weeks, highRisks } from the pipeline
 */
export async function calculateProcurement(answers, d) {
  const model = parseProcurementWorkbook(await fetchProcurementWorkbook())
  return selectProcurement(model, {
    valueGBP: d.valueGBP,
    weeks: d.weeks,
    highRisks: d.highRisks,
    priority: topPriority(answers),
    publicClient: publicClient(answers),
  })
}
