/**
 * lib/nrmWorkbook.js — loads, checks and models the NRM1 v5.2 workbook.
 *
 * Server-only (SheetJS). The workbook is the app's brain: every scope item,
 * option, rule, list, rate, ratio and percentage comes from it at runtime, and
 * this module holds none of them. It knows only the workbook's SHAPE:
 *
 *   '2. Scope and Rates'  one row per priced line, columns found by the header
 *                         text in the row that starts "Rate key"
 *   '3. Settings'         tables found by their ▶ marker, each ending at the
 *                         first blank row
 *   '1. Instructions'     the self-checks, each of which must read 0
 *
 * Check before use: a file whose required headers or tables are missing, whose
 * formula cells were saved without values (a tool that doesn't recalculate),
 * whose self-checks aren't 0, or whose rules reference an unknown name, code or
 * item is REJECTED — the last good version stays in use and the rejection is
 * reported by /api/rates-check. There is no hard-coded fallback: with no good
 * version loaded yet, the error propagates.
 *
 * RATES_FILE_URL is fetched over HTTP(S) as before (cached 10 minutes). A value
 * that isn't a URL is read as a local path — for tests and local verification
 * only, e.g. RATES_FILE_URL=NRM1_Cost_Estimate_Tool_v5_2.xlsx.
 */
import * as XLSX from 'xlsx'
import { compile, references, parseCondition, INPUT_NAMES } from './scopeExpr.js'

const TTL_MS = 10 * 60 * 1000

export const SHEETS = {
  instructions: '1. Instructions',
  scope: '2. Scope and Rates',
  settings: '3. Settings',
}

// The pricing types the engine knows. The quantity comes from each row's
// Quantity rule; the type is validated so a new one is a visible code change
// (the workbook's own "Needs a code change" list), never a silent zero.
export const PRICING_TYPES = new Set([
  'gifa_rate', 'footprint_rate', 'upperfloors_rate', 'area_rate', 'external_area_rate',
  'per_nr', 'per_item', 'per_m', 'per_kwp', 'per_kwh', 'per_kw',
])

export const EFFECT_TYPES = new Set(['RISK', 'ASSUME', 'RATE', 'SUGGEST'])

// Columns on '2. Scope and Rates' the app reads. Rate columns are added from
// ▶ project_types, so a new rate column is just a header plus a table entry.
const SCOPE_HEADERS = {
  rateKey: 'Rate key', scopeId: 'Scope ID', rowType: 'Row type', group: 'Group', section: 'Section',
  item: 'Item', included: "What's included", pick: 'Options: pick', option: 'Option',
  rateUse: 'Rate building use', isDefault: 'Default option', unit: 'Unit', pricingType: 'Pricing type',
  qrule: 'Quantity rule', availFrom: 'Available from intervention level',
  preLevels: 'Pre-ticked at intervention levels', band: 'Apply band + location factor',
  source: 'Price source', sourceDetail: 'Source detail',
  shownOn: 'Shown on', preOn: 'Pre-ticked on', uses: 'Relevant building uses',
  condition: 'Other conditions', when: 'When selected',
  bcis1: 'BCIS element 1', share1: 'Share 1', bcis2: 'BCIS element 2', share2: 'Share 2',
  replaces: 'Replaces old codes',
}

// ▶ tables and the headers each must carry.
const SETTINGS_TABLES = {
  workbook_info: ['Field', 'Value'],
  building_uses: ['Code', 'Building use', 'Notes'],
  project_types: ['Code', 'Project type', 'Basic column', 'Standard column', 'High column', 'Uses level of intervention'],
  spec_levels: ['Level', 'Description'],
  intervention_levels: ['Level', 'Name', 'Band multiplier', 'Description'],
  location_factors: ['Region', 'Postcode areas', 'Low', 'High', 'Mid'],
  benchmarks: ['Project type', 'Building use', 'Expected low £/m²', 'Expected high £/m²'],
  inputs: ['Name', 'Comes from', 'Default'],
  quantity_ratios: ['Key', 'Building use', 'Value', 'Source'],
  factors: ['Key', 'Value', 'Applies to'],
  percentage_rules: ['Code', 'Addition', 'Type', 'Condition', 'Adjust %', 'Cap %'],
}

// ─── Small readers ───────────────────────────────────────────────────────────

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const stripParen = s => norm(String(s ?? '').replace(/\s*\([^)]*\)\s*$/, ''))
/** Header match: exact text, or the text before a trailing "(…)" note. */
function headerIndex(headers, want) {
  const w = norm(want), ws = stripParen(want)
  let i = headers.findIndex(h => norm(h) === w)
  if (i < 0) i = headers.findIndex(h => stripParen(h) === ws)
  return i
}
const codes = v => {
  const s = String(v ?? '').trim()
  if (!s || s === '—' || s === '-') return []
  return s.split(/[\s,]+/).map(c => c.trim()).filter(Boolean)
}
const yes = v => /^y(es)?$/i.test(String(v ?? '').trim())
const numOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const levels = v => String(v ?? '').split(/[\s,]+/).map(Number).filter(n => Number.isInteger(n) && n > 0)

function sheetRows(ws, raw) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw, blankrows: true })
}

function excelDateText(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return String(v ?? '').trim()
}

// ─── '3. Settings' ───────────────────────────────────────────────────────────

function readSettingsTables(ws) {
  const raw = sheetRows(ws, true)
  const txt = sheetRows(ws, false)
  const tables = {}
  for (let i = 0; i < raw.length; i++) {
    const a = String(raw[i]?.[0] ?? '').trim()
    if (!a.startsWith('▶')) continue
    const name = a.replace(/^▶\s*/, '').trim()
    const headers = (raw[i + 1] || []).map(h => String(h ?? '').trim())
    const rows = []
    for (let j = i + 2; j < raw.length; j++) {
      const r = raw[j] || []
      if (r.every(c => String(c ?? '').trim() === '')) break
      if (String(r[0] ?? '').trim().startsWith('▶')) break
      rows.push({ raw: r, text: txt[j] || [] })
    }
    tables[name] = { headers, rows }
  }
  return tables
}

function tableReader(table) {
  const idx = want => headerIndex(table.headers, want)
  return {
    has: want => idx(want) >= 0,
    rows: table.rows.map(r => ({
      get: want => { const i = idx(want); return i < 0 ? '' : r.raw[i] },
      text: want => { const i = idx(want); return i < 0 ? '' : String(r.text[i] ?? r.raw[i] ?? '').trim() },
    })),
  }
}

function buildSettings(tables, problems) {
  for (const [name, headers] of Object.entries(SETTINGS_TABLES)) {
    const t = tables[name]
    if (!t) { problems.push(`'3. Settings' has no ▶ ${name} table`); continue }
    for (const h of headers) if (headerIndex(t.headers, h) < 0) problems.push(`▶ ${name} is missing the "${h}" column`)
  }
  const T = name => tables[name] ? tableReader(tables[name]) : { has: () => false, rows: [] }

  const info = {}
  for (const r of T('workbook_info').rows) info[String(r.get('Field')).trim()] = r.get('Value')
  const version = String(info.Version ?? '').trim()
  const date = excelDateText(info.Date)

  const buildingUses = T('building_uses').rows.map(r => ({
    code: String(r.get('Code')).trim(),
    label: String(r.get('Building use')).trim(),
    residential: yes(r.get('Treated as residential')),
    listsEverything: /every item listed/i.test(String(r.get('Notes'))),
  })).filter(r => r.code)

  const projectTypes = T('project_types').rows.map(r => ({
    code: String(r.get('Code')).trim(),
    label: String(r.get('Project type')).trim(),
    columns: {
      Basic: String(r.get('Basic column')).trim(),
      Standard: String(r.get('Standard column')).trim(),
      High: String(r.get('High column')).trim(),
    },
    usesLevel: yes(r.get('Uses level of intervention')),
    notes: String(r.get('Notes') || '').trim(),
  })).filter(r => r.code)

  const specLevels = T('spec_levels').rows.map(r => ({
    level: String(r.get('Level')).trim(), description: String(r.get('Description')).trim(),
  })).filter(r => r.level)

  const interventionLevels = T('intervention_levels').rows.map(r => ({
    level: numOr(r.get('Level'), NaN),
    name: String(r.get('Name')).trim(),
    band: numOr(r.get('Band multiplier'), NaN),
    description: String(r.get('Description')).trim(),
    designMultiplier: numOr(r.get('Design duration multiplier'), NaN),
  })).filter(r => Number.isFinite(r.level) && r.name)
  for (const l of interventionLevels) if (!(l.band > 0)) problems.push(`▶ intervention_levels level ${l.level} has no band multiplier`)

  const locationFactors = T('location_factors').rows.map(r => {
    const region = String(r.get('Region')).trim()
    return {
      region: region.replace(/\s*★\s*DEFAULT\s*/i, '').trim(),
      isDefault: /★\s*DEFAULT/i.test(region),
      postcodes: String(r.get('Postcode areas')).split(',').map(p => p.trim().toUpperCase()).filter(Boolean),
      low: numOr(r.get('Low')), high: numOr(r.get('High')), mid: numOr(r.get('Mid')),
    }
  }).filter(r => r.region && r.mid > 0)
  if (locationFactors.filter(r => r.isDefault).length !== 1) problems.push('▶ location_factors must mark exactly one region "★ DEFAULT"')

  const benchmarks = T('benchmarks').rows.map(r => ({
    pt: String(r.get('Project type')).trim(), use: String(r.get('Building use')).trim(),
    low: numOr(r.get('Expected low £/m²')), high: numOr(r.get('Expected high £/m²')),
  })).filter(r => r.pt && r.use && r.low > 0 && r.high > 0)

  const inputs = {}
  for (const r of T('inputs').rows) {
    const name = String(r.get('Name')).trim()
    if (!name) continue
    inputs[name] = { comesFrom: String(r.get('Comes from')).trim(), default: String(r.get('Default') ?? '').trim() }
  }
  for (const n of INPUT_NAMES) if (!inputs[n]) problems.push(`▶ inputs has no row for ${n}`)

  const ratios = T('quantity_ratios').rows.map(r => ({
    key: String(r.get('Key')).trim(), use: String(r.get('Building use')).trim(),
    value: Number(r.get('Value')), source: String(r.get('Source')).trim(),
  })).filter(r => r.key)
  for (const r of ratios) if (!Number.isFinite(r.value)) problems.push(`ratio ${r.key} (${r.use}) has no value`)
  for (const key of new Set(ratios.map(r => r.key))) if (!ratios.some(r => r.key === key && r.use === 'ALL')) problems.push(`ratio ${key} has no ALL row`)

  const factors = {}
  for (const r of T('factors').rows) {
    const key = String(r.get('Key')).trim()
    if (!key) continue
    factors[key] = { value: Number(r.get('Value')), appliesTo: String(r.get('Applies to')).trim(), when: String(r.get('When') || '').trim(), source: String(r.get('Source') || '').trim() }
  }

  const percentageRules = T('percentage_rules').rows.map(r => ({
    code: String(r.get('Code')).trim(),
    addition: String(r.get('Addition')).trim(),
    type: String(r.get('Type')).trim(),
    condition: String(r.get('Condition')).trim(),
    adjustPct: numOr(r.get('Adjust %')),
    capPct: numOr(r.get('Cap %')),
  })).filter(r => r.code && r.type)
  const needRule = (code, type) => {
    if (!percentageRules.some(r => r.code === code && (!type || r.type === type))) problems.push(`▶ percentage_rules has no ${code}${type ? ` ${type}` : ''} row`)
  }
  needRule('A', 'BASE'); needRule('B', 'RANGE'); needRule('C', 'BASE'); needRule('E', 'BASE'); needRule('H', 'FIXED'); needRule('G'); needRule('F')

  const retiredCodes = T('retired_codes').rows.map(r => ({
    code: String(r.text('Old code')).trim(), was: String(r.get('Was')).trim(), reason: String(r.get('Reason')).trim(),
  })).filter(r => r.code)

  // Optional: low/high factors per confidence grade (added in workbook v5.3).
  // Absent → the cost engine's documented legacy range applies.
  let rangeWidths = null
  if (tables.range_widths) {
    rangeWidths = {}
    for (const r of T('range_widths').rows) {
      const g = String(r.get('Grade')).trim().toUpperCase()
      const low = Number(r.get('Low')), high = Number(r.get('High'))
      if (/^[A-D]$/.test(g) && low > 0 && high > 0) rangeWidths[g] = { low, high }
    }
    if (Object.keys(rangeWidths).length === 0) rangeWidths = null
  }

  return {
    info: { version, date, owner: String(info.Owner ?? '').trim() },
    buildingUses, projectTypes, specLevels, interventionLevels, locationFactors,
    benchmarks, inputs, ratios, factors, percentageRules, retiredCodes, rangeWidths,
  }
}

// ─── '2. Scope and Rates' ────────────────────────────────────────────────────

function parseDims(label) {
  const parts = String(label).split('·').map(s => s.trim()).filter(Boolean)
  return parts.map(p => {
    const m = p.match(/^([^:]+):\s*(.+)$/)
    return m ? { dim: m[1].trim(), value: m[2].trim() } : { dim: null, value: p }
  })
}

// "RISK: …" · "ASSUME (NB): …" · "RATE: Electricity supply upgrade one band up" · "SUGGEST: S-0001 Asbestos removal"
function parseEffects(raw, problems, where) {
  const s = String(raw ?? '').trim()
  if (!s || s === '—') return []
  return s.split(/\s+·\s+/).map(part => {
    const m = part.match(/^([A-Z]+)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/)
    if (!m) { problems.push(`${where}: can't read the "When selected" effect "${part}"`); return null }
    const type = m[1], text = m[3].trim()
    if (!EFFECT_TYPES.has(type)) { problems.push(`${where}: "${type}" is not a known 'When selected' effect (a new kind needs a code change)`); return null }
    const effect = { type, text, projectTypes: m[2] ? codes(m[2]) : null }
    if (type === 'SUGGEST') {
      const id = text.match(/\bS-\d{4}\b/)?.[0]
      if (!id) problems.push(`${where}: SUGGEST needs a Scope ID ("${part}")`)
      effect.target = id
    }
    if (type === 'RATE') {
      const bm = text.match(/^(.*?)\s+(one|two|three|\d+)\s+bands?\s+up$/i)
      if (!bm) problems.push(`${where}: RATE effect must read "<item> one band up" ("${part}")`)
      else {
        effect.targetName = bm[1].trim()
        effect.bands = { one: 1, two: 2, three: 3 }[bm[2].toLowerCase()] || Number(bm[2]) || 1
      }
    }
    return effect
  }).filter(Boolean)
}

function buildCatalogue(wsScope, settings, problems) {
  const raw = sheetRows(wsScope, true)
  const txt = sheetRows(wsScope, false)
  const hRow = raw.findIndex(r => norm(r?.[0]) === 'rate key')
  if (hRow < 0) { problems.push(`'2. Scope and Rates' has no header row starting "Rate key"`); return { items: [], rateColumns: [] } }
  const headers = raw[hRow].map(h => String(h ?? '').trim())
  const col = {}
  for (const [k, h] of Object.entries(SCOPE_HEADERS)) {
    col[k] = headerIndex(headers, h)
    if (col[k] < 0) problems.push(`'2. Scope and Rates' is missing the "${h}" column`)
  }

  // Rate columns = every column named on ▶ project_types that exists as a header.
  // A name that isn't a header is only allowed for Other or mixed ("Per component").
  const rateColumns = [...new Set(settings.projectTypes.flatMap(p => Object.values(p.columns)))]
    .filter(name => headerIndex(headers, name) >= 0)
  for (const p of settings.projectTypes) {
    for (const [lvl, name] of Object.entries(p.columns)) {
      if (!rateColumns.includes(name) && !/per component/i.test(name)) problems.push(`▶ project_types ${p.code} ${lvl} column "${name}" is not a column on '2. Scope and Rates'`)
    }
  }
  const rateIdx = Object.fromEntries(rateColumns.map(n => [n, headerIndex(headers, n)]))

  const ptCodes = new Set(settings.projectTypes.map(p => p.code))
  const useCodes = new Set(settings.buildingUses.map(u => u.code))
  const checkCodes = (list, set, what, where) => { for (const c of list) if (!set.has(c)) problems.push(`${where}: "${c}" is not a ${what} code defined on '3. Settings'`) }

  const items = [], byId = new Map(), seenKeys = new Set()
  for (let i = hRow + 1; i < raw.length; i++) {
    const r = raw[i] || [], t = txt[i] || []
    const T = k => col[k] >= 0 ? String(t[col[k]] ?? r[col[k]] ?? '').trim() : ''
    const R = k => col[k] >= 0 ? r[col[k]] : ''
    const key = T('rateKey')
    if (!key) continue
    const where = `Row ${i + 1} (${key})`
    if (seenKeys.has(key)) problems.push(`${where}: duplicate rate key`)
    seenKeys.add(key)
    const id = T('scopeId')
    const type = T('rowType')

    const rates = {}
    for (const [n, ci] of Object.entries(rateIdx)) rates[n] = numOr(r[ci])
    const rateUses = codes(T('rateUse'))
    checkCodes(rateUses, useCodes, 'building use', where)
    const rowRec = {
      key, uses: rateUses.length ? rateUses : ['ALL'], rates,
      source: T('source'), sourceDetail: T('sourceDetail'),
      effects: parseEffects(T('when'), problems, where),
    }
    if (!rowRec.source) problems.push(`${where}: no price source`)
    const optionLabel = T('option') || 'Standard'
    const opt = {
      key, label: optionLabel, dims: parseDims(optionLabel),
      isDefault: yes(T('isDefault')),
      availFrom: numOr(R('availFrom'), 1) || 1,
      preLevels: levels(T('preLevels')),
      qrule: T('qrule'),
      unit: T('unit'),
      pricingType: T('pricingType'),
      band: yes(T('band')),
    }
    if (opt.pricingType && !PRICING_TYPES.has(opt.pricingType)) problems.push(`${where}: pricing type "${opt.pricingType}" is not one the app knows (a new pricing type needs a code change)`)
    if (opt.qrule) { try { compile(opt.qrule) } catch (e) { problems.push(`${where}: quantity rule — ${e.message}`) } }

    if (type === 'Item') {
      if (byId.has(id)) { problems.push(`${where}: Scope ID ${id} has more than one Item row`); continue }
      const g = T('group').match(/^(\d+)\s+(.*)$/)
      let condition = null
      try { condition = parseCondition(T('condition')) } catch (e) { problems.push(`${where}: ${e.message}`) }
      const section = T('section')
      const item = {
        id, name: T('item'), included: T('included'),
        groupNum: g ? Number(g[1]) : NaN, groupLabel: g ? g[2].trim() : T('group'),
        section: !section || section === '—' || condition?.auto ? null : section,
        pick: /several/i.test(T('pick')) ? 'Several' : 'One',
        unit: opt.unit, pricingType: opt.pricingType, qrule: opt.qrule,
        shownOn: codes(T('shownOn')), preOn: codes(T('preOn')), uses: codes(T('uses')),
        condition, auto: !!condition?.auto,
        bcis: [
          { element: T('bcis1'), share: numOr(R('share1')) },
          { element: T('bcis2'), share: numOr(R('share2')) },
        ].filter(b => b.element),
        replaces: T('replaces').split(',').map(s => s.trim()).filter(s => s && s !== '—'),
        options: [],
      }
      if (!Number.isFinite(item.groupNum)) problems.push(`${where}: Group "${T('group')}" must start with its number`)
      if (!item.qrule) problems.push(`${where}: Item row has no quantity rule`)
      checkCodes(item.shownOn, ptCodes, 'project type', where)
      checkCodes(item.preOn, ptCodes, 'project type', where)
      checkCodes(item.uses, useCodes, 'building use', where)
      const shareTotal = item.bcis.reduce((s, b) => s + b.share, 0)
      if (Math.abs(shareTotal - 1) > 0.001) problems.push(`${where}: BCIS shares total ${shareTotal}, not 100%`)
      items.push(item); byId.set(id, item)
    }
    const item = byId.get(id)
    if (!item) { problems.push(`${where}: Option row with no Item row for ${id}`); continue }
    // Rows sharing an option label are the same option priced for different
    // building uses (Toilets · Standard for HOS, HEA …); the first (ALL) row
    // carries the option's identity and rules.
    const same = item.options.find(o => o.label === opt.label)
    if (same) same.rows.push(rowRec)
    else item.options.push({ ...opt, rows: [rowRec], effects: rowRec.effects })
    if (same && rowRec.effects.length) same.effects = [...same.effects, ...rowRec.effects]
  }

  // Second pass: things that need every item.
  const ratioKeys = new Set(settings.ratios.map(r => r.key))
  for (const item of items) {
    if (!item.options.some(o => o.rows.some(rw => rw.uses.includes('ALL')))) problems.push(`${item.id}: no ALL building-use row`)
    if (item.options.length && !item.options.some(o => o.isDefault)) problems.push(`${item.id} ${item.name}: no default option`)
    if (item.pick === 'One' && item.options.filter(o => o.isDefault).length > 1) problems.push(`${item.id} ${item.name}: 'pick one' item with more than one default`)
    for (const o of item.options) {
      for (const rule of [o.qrule].filter(Boolean)) {
        try {
          const refs = references(rule)
          for (const k of refs.ratios) if (!ratioKeys.has(k)) problems.push(`${o.key}: ratio r.${k} is not on ▶ quantity_ratios`)
          for (const q of refs.items) if (!byId.has(q)) problems.push(`${o.key}: Q(${q}) refers to no item`)
        } catch { /* already reported */ }
      }
      for (const e of o.effects) {
        if (e.type === 'SUGGEST' && e.target && !byId.has(e.target)) problems.push(`${o.key}: SUGGEST ${e.target} refers to no item`)
        if (e.type === 'RATE' && e.targetName && !items.some(it => norm(it.name) === norm(e.targetName))) problems.push(`${o.key}: RATE effect names "${e.targetName}", which is not an item`)
      }
      // Which project types can price this option at all (no rates leave the
      // server — only these booleans). "Per component" (Other or mixed) reads the
      // refurbishment columns with the new-build columns as fallback, per the
      // September 2026 decision to drop the mixed area split.
      o.priceableFor = {}
      for (const p of settings.projectTypes) {
        const cols = columnsFor(settings, p.code).flat()
        o.priceableFor[p.code] = o.rows.some(rw => cols.some(c => (rw.rates[c] || 0) > 0))
      }
    }
  }
  for (const u of Object.values(settings.inputs)) {
    if (!u.default) continue
    try { compile(u.default) } catch (e) { problems.push(`▶ inputs default "${u.default}": ${e.message}`) }
  }
  return { items, rateColumns }
}

/**
 * The Q2.4 levels that read a different rate column for a project type. Where
 * two levels share a column (new build Basic reads NB Std), Standard is the one
 * kept — offering "Basic" would promise a saving that doesn't exist.
 */
export function distinctSpecLevels(settings, ptCode) {
  const levels = settings.specLevels.map(l => l.level)
  const pref = [...levels.filter(l => l === 'Standard'), ...levels.filter(l => l !== 'Standard')]
  const keep = new Set(), seen = new Set()
  for (const lvl of pref) {
    const key = columnsFor(settings, ptCode, lvl).join('|')
    if (!seen.has(key)) { seen.add(key); keep.add(lvl) }
  }
  return levels.filter(l => keep.has(l))
}

/**
 * The rate column(s) a project type reads at each spec level. Returns
 * [primary, fallback?]. Other or mixed's "Per component" is read as the
 * refurbishment column, falling back to new build where that is zero.
 */
export function columnsFor(settings, ptCode, spec) {
  const pt = settings.projectTypes.find(p => p.code === ptCode)
  if (!pt) return []
  const levelsWanted = spec ? [spec] : ['Basic', 'Standard', 'High']
  const out = []
  for (const lvl of levelsWanted) {
    const name = pt.columns[lvl] || pt.columns.Standard
    if (/per component/i.test(name)) {
      const rf = settings.projectTypes.find(p => p.code === 'RF')
      const nb = settings.projectTypes.find(p => p.code === 'NB')
      out.push([rf?.columns[lvl], nb?.columns[lvl]].filter(Boolean))
    } else out.push([name])
  }
  return spec ? out[0] : out
}

// ─── '1. Instructions' self-checks, and formula cells ────────────────────────

function readSelfChecks(ws) {
  const rows = sheetRows(ws, true)
  const start = rows.findIndex(r => /^self-checks/i.test(String(r?.[0] ?? '').trim()))
  if (start < 0) return { found: false, checks: [] }
  const checks = []
  for (let i = start + 1; i < rows.length; i++) {
    const label = String(rows[i]?.[0] ?? '').trim()
    if (!label) break
    checks.push({ label, value: rows[i][2] })
  }
  return { found: true, checks }
}

function formulaCellsWithoutValues(ws) {
  const out = []
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue
    const c = ws[addr]
    if (c && c.f && (c.v === undefined || c.v === null || c.v === '')) out.push(addr)
  }
  return out
}

// ─── The model ───────────────────────────────────────────────────────────────

/** Parse and check a SheetJS workbook. Never throws; returns { model, problems }. */
export function buildModel(wb) {
  const problems = []
  for (const s of Object.values(SHEETS)) if (!wb.Sheets[s]) problems.push(`missing sheet "${s}"`)
  if (problems.length) {
    const legacy = wb.Sheets['2. Master Cost Table'] ? ' — this looks like the v4.5 workbook; RATES_FILE_URL must point at v5.2' : ''
    return { model: null, problems: problems.map(p => p + legacy) }
  }
  for (const s of Object.values(SHEETS)) {
    const empty = formulaCellsWithoutValues(wb.Sheets[s])
    if (empty.length) problems.push(`'${s}' has ${empty.length} formula cell(s) saved without a value (${empty.slice(0, 5).join(', ')}${empty.length > 5 ? '…' : ''}) — open and save it in Excel so it recalculates`)
  }
  const self = readSelfChecks(wb.Sheets[SHEETS.instructions])
  if (!self.found) problems.push(`'1. Instructions' has no SELF-CHECKS block`)
  for (const c of self.checks) if (Number(c.value) !== 0) problems.push(`self-check "${c.label}" reads ${c.value === '' ? '(blank)' : c.value}, not 0`)

  const settings = buildSettings(readSettingsTables(wb.Sheets[SHEETS.settings]), problems)
  const { items, rateColumns } = buildCatalogue(wb.Sheets[SHEETS.scope], settings, problems)
  if (items.length === 0) problems.push(`'2. Scope and Rates' has no Item rows`)

  const v = settings.info.version
  const model = {
    settings, items, rateColumns,
    version: v,
    versionLabel: v ? `NRM1 v${v}${settings.info.date ? ` (${settings.info.date})` : ''}` : null,
  }
  return { model, problems }
}

/**
 * The catalogue as the questionnaire sees it: every rule, option and list, no
 * rates, no price sources. Same shape as the server model otherwise, so
 * lib/scopeEngine.js runs identically on both.
 */
export function publicCatalogue(model) {
  const s = model.settings
  return {
    version: model.version,
    versionLabel: model.versionLabel,
    settings: {
      // specLevels: the Q2.4 levels that read a DIFFERENT rate column for this
      // type (new build has no Basic column — Basic reads NB Std — so it is
      // not offered as a saving that doesn't exist). One or none → Q2.4 hidden.
      projectTypes: s.projectTypes.map(p => ({
        code: p.code, label: p.label, usesLevel: p.usesLevel,
        specLevels: distinctSpecLevels(s, p.code),
      })),
      buildingUses: s.buildingUses.map(u => ({ code: u.code, label: u.label, listsEverything: u.listsEverything })),
      specLevels: s.specLevels,
      interventionLevels: s.interventionLevels.map(l => ({ level: l.level, name: l.name, description: l.description })),
      inputs: s.inputs,
      ratios: s.ratios.map(r => ({ key: r.key, use: r.use, value: r.value })),
      hasModularFactor: !!s.factors.modular_factor,
    },
    items: model.items.map(it => ({
      ...it,
      options: it.options.map(({ rows, ...o }) => ({
        ...o,
        aiEstimate: rows.some(rw => /ai estimate/i.test(rw.source)),
      })),
    })),
  }
}

// ─── Loader with last-good cache ─────────────────────────────────────────────

let _state = { model: null, loadedAt: 0, checkedAt: 0, rejected: null, error: null }

export class WorkbookRejectedError extends Error {
  constructor(problems) {
    super(`NRM1 workbook rejected: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`)
    this.problems = problems
  }
}

async function readSource() {
  const url = process.env.RATES_FILE_URL
  if (!url) throw new Error('RATES_FILE_URL environment variable not set')
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to fetch NRM1 workbook: HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')
  // Local path: tests and local verification only. The ignore comment stops
  // Turbopack tracing the whole project into the server bundle for a read
  // that production (always a URL) never makes.
  return new Uint8Array(await readFile(path.resolve(/*turbopackIgnore: true*/ process.cwd(), url)))
}

/** Parse bytes into a checked model, or throw WorkbookRejectedError. */
export function modelFromBytes(bytes) {
  const wb = XLSX.read(bytes, { type: 'array', cellFormula: true })
  const { model, problems } = buildModel(wb)
  if (problems.length) throw new WorkbookRejectedError(problems)
  return model
}

/**
 * The current checked workbook model. Re-reads the source every 10 minutes; a
 * new version is used only if it passes every check, otherwise the last good
 * version stays in use and the rejection is kept for /api/rates-check.
 */
export async function loadNrmWorkbook() {
  const now = Date.now()
  if (_state.model && now - _state.checkedAt < TTL_MS) return _state.model
  try {
    const model = modelFromBytes(await readSource())
    _state = { model, loadedAt: now, checkedAt: now, rejected: null, error: null }
    return model
  } catch (e) {
    const rejected = e instanceof WorkbookRejectedError ? { at: new Date(now).toISOString(), problems: e.problems } : null
    if (_state.model) {
      console.error(`[nrmWorkbook] ${e.message} — keeping last good version ${_state.model.versionLabel}`)
      _state = { ..._state, checkedAt: now, rejected, error: rejected ? null : e.message }
      return _state.model
    }
    _state = { ..._state, checkedAt: 0, rejected, error: rejected ? null : e.message }
    throw e
  }
}

/** What the admin health check reports: the version in use and any rejected update. */
export function workbookStatus() {
  return {
    version: _state.model?.versionLabel || null,
    loadedAt: _state.loadedAt ? new Date(_state.loadedAt).toISOString() : null,
    rejectedUpdate: _state.rejected,
    lastError: _state.error,
  }
}

/** Test hook: forget the cached model. */
export function _resetWorkbookCache() {
  _state = { model: null, loadedAt: 0, checkedAt: 0, rejected: null, error: null }
}

/** Test hook: make the next load re-read the source (the last good model is kept). */
export function _expireWorkbookCache() {
  _state = { ..._state, checkedAt: 0 }
}
