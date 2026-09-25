// Reads every test-reports/<id>/scenario.md, turns the "## Answers" section into
// a plan.json of form actions, and checks each answer against what the form
// actually offers for that project type (same workbook + question sets the
// questionnaire uses). Prints problems; a scenario with problems gets no plan.
//   node test-reports/_reference/build-plans.mjs [id ...]
import fs from 'node:fs'
import path from 'node:path'
import { modelFromBytes, publicCatalogue } from '../../lib/nrmWorkbook.js'
import { buildContext, isShown, offeredOptions, isOptionAvailable } from '../../lib/scopeEngine.js'
import { knownIssuesFor, surveysFor, isQuestionShown } from '../../lib/questionSets.js'
import { SITE_CONTEXT_OPTIONS } from '../../lib/siteContext.js'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const ROOT = path.resolve(HERE, '..')
const r = modelFromBytes(fs.readFileSync(path.resolve(ROOT, '..', 'NRM1_Cost_Estimate_Tool_v5_2.xlsx')))
const cat = publicCatalogue(r.model ?? r)
const itemById = new Map(cat.items.map(i => [i.id, i]))

// Option lists copied from app/questionnaire/page.jsx (the form's own constants).
const LISTS = {
  'Q1.4': ['Pre-1900', '1900–1979', '1980–1999', 'Post-2000'],
  'Q1.6': ['Yes', 'No', 'Not sure'],
  'Q2.4': ['Basic', 'Standard', 'High'],
  'Q2.5': ['BREEAM', 'PAS 2035', 'NHS design guide', 'Net zero', 'University design guide', 'Acoustic', 'Food hygiene', 'MCS', 'DNO', 'Highways', 'Dark sky', 'None', 'Other'],
  'Q3.4': ['No consent required', 'Permitted development', 'Prior approval', 'Full planning', 'Full planning + Listed Building Consent', 'Change of use', 'Unsure (pre-application advice)'],
  'Q3.5': ['Restricted working hours', 'Shared access with other occupiers', 'No vehicle access or restricted deliveries', 'Height or weight restrictions on site', 'Scaffold licence or highway encroachment required', 'Term-time only working', 'No access constraints', 'Other'],
  'Q3.6': ['Fully occupied', 'Partially occupied', 'Vacant or decanted'],
  'Q3.8': SITE_CONTEXT_OPTIONS,
  'Q4.4': ['Lowest cost', 'Fixed / certain final cost', 'Speed', 'Design quality', 'Flexibility', 'Minimise disruption', 'Funder / compliance requirement'],
  'Q4.5': ['Concept only (Stage 0–1)', 'Concept complete (Stage 2)', 'Developed design (Stage 3)', 'Technical complete (Stage 4)'],
  'Q4.6': ['Single phase', 'Multiple phases'],
  'Q4.7': ['Internal / commercial', 'Grant or public funding', 'Not yet confirmed'],
  'Q5.1': ['Energy or operational cost savings', 'Rental or commercial income', 'Grant or funding unlock', 'Avoidance of compliance cost or penalty', 'Increased asset value', 'No direct financial return — strategic or compliance project'],
}
const MULTI = new Set(['Q2.5', 'Q3.1', 'Q3.3', 'Q3.5', 'Q3.8', 'Q4.4', 'Q5.1'])
const KEY = { 'Q1.2a': 'q1_2_storeys', 'Q1.4': 'q1_4_buildingAge', 'Q3.5': 'q3_5_accessConstraints', 'Q3.6': 'q3_6_occupation', 'Q3.2': 'q3_2_previousWorks', 'Q3.8': 'q3_8_siteContext' }

// Pick known options out of free text, longest first, in the order they appear.
function pickOptions(text, options) {
  let rest = text
  const found = []
  for (const o of [...options].sort((a, b) => b.length - a.length)) {
    const i = rest.indexOf(o)
    if (i >= 0) { found.push({ o, i }); rest = rest.slice(0, i) + '\u0000'.repeat(o.length) + rest.slice(i + o.length) }
  }
  const leftover = rest.replace(/\u0000+/g, '').replace(/[,;.\s]+/g, ' ').trim()
  return { values: found.sort((a, b) => a.i - b.i).map(f => f.o), leftover }
}

function parse(md) {
  const body = md.split(/^## Answers\s*$/m)[1]?.split(/^## /m)[0] || ''
  const items = []
  let cur = null, sub = null
  for (const raw of body.split(/\r?\n/)) {
    if (/^- Q/.test(raw)) {
      const m = raw.match(/^- (Q\d\.\d+a?)\b([^:]*):\s*(.*)$/) || raw.match(/^- (Q\d\.\d+a?)\b(.*)$/)
      cur = { q: m[1], label: m[2].trim(), value: (m[3] || '').trim(), subs: [] }; sub = null; items.push(cur)
    } else if (/^\s{2,3}- /.test(raw) && cur) {
      const m = raw.trim().slice(2).match(/^([^:]+):\s*(.*)$/)
      sub = { key: m ? m[1].trim() : raw.trim(), value: m ? m[2].trim() : '' }; cur.subs.push(sub)
    } else if (/^\s+\S/.test(raw) && cur) {
      if (sub) sub.value += ' ' + raw.trim(); else cur.value += ' ' + raw.trim()
    } else if (/^#/.test(raw)) { cur = null; sub = null }
  }
  return items
}

const blank = v => !v || /^\(leave blank\)$/i.test(v) || /^\(none/i.test(v)
const date = (v, problems, q) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`
  problems.push(`${q}: "${v}" is not a date`); return null
}

function build(id) {
  const md = fs.readFileSync(path.join(ROOT, id, 'scenario.md'), 'utf8')
  const items = parse(md)
  const get = q => items.find(i => i.q === q)
  const problems = [], notes = []
  const pt = get('Q1.2')?.value
  const ptRow = cat.settings.projectTypes.find(p => p.label === pt)
  if (!ptRow) return { problems: [`Q1.2: unknown project type "${pt}"`] }
  const use = get('Q1.3')?.value
  if (!cat.settings.buildingUses.some(u => u.label === use && u.code !== 'ALL')) problems.push(`Q1.3: unknown building use "${use}"`)
  const age = get('Q1.4')?.value
  const lists = { ...LISTS, 'Q3.1': knownIssuesFor(pt), 'Q3.3': surveysFor(pt, age), 'Q2.2': cat.settings.interventionLevels.map(l => l.name) }
  const sections = { 1: [], 2: [], 3: [], 4: [] }
  let scope = null

  for (const it of items) {
    const sec = Number(it.q[1]) >= 5 ? 4 : Number(it.q[1])
    if (KEY[it.q] && !isQuestionShown(KEY[it.q], pt)) {
      if (!blank(it.value)) notes.push(`${it.q}: not asked for ${pt} — skipped`)
      continue
    }
    if (it.q === 'Q2.3') {
      const s = Object.fromEntries(it.subs.map(x => [x.key.toLowerCase().replace(/ \(.*$/, ''), x.value]))
      scope = { typical: /typical/i.test(s.start || ''), add: [], remove: [], options: [], quantities: [], method: s['construction method'] || null }
      const ids = v => blank(v) ? [] : [...v.matchAll(/S-\d{4}(?!-)/g)].map(m => m[0])
      scope.add = ids(s.add); scope.remove = ids(s.remove)
      const ctx = buildContext(cat, { q1_2_projectType: pt, q1_3_buildingUse: use, q1_4_buildingAge: age, q2_3_interventionLevel: get('Q2.2')?.value })
      for (const sid of [...scope.add, ...scope.remove]) {
        const item = itemById.get(sid)
        if (!item) problems.push(`Q2.3: unknown item ${sid}`)
        else if (!isShown(item, ctx)) problems.push(`Q2.3: ${sid} ${item.name} is not shown for ${pt}`)
      }
      for (const m of (blank(s.options) ? [] : s.options.matchAll(/(S-\d{4}-\d{2})/g))) {
        const key = m[1], item = itemById.get(key.slice(0, 6)), opt = item?.options.find(o => o.key === key)
        if (!opt) { problems.push(`Q2.3: unknown option ${key}`); continue }
        if (!offeredOptions(item, ctx).some(o => o.key === key)) problems.push(`Q2.3: option ${key} is not offered for ${pt}`)
        else if (!isOptionAvailable(opt, ctx)) problems.push(`Q2.3: option ${key} needs a higher intervention level`)
        scope.options.push({ id: item.id, name: item.name, pick: item.pick, key, label: opt.label, dims: opt.dims.map(d => ({ dim: d.dim || 'Option', value: d.value })) })
      }
      for (const m of (blank(s.quantities) ? [] : s.quantities.matchAll(/(S-\d{4}-\d{2})[^=]*=\s*([\d,.]+)/g))) {
        const key = m[1], item = itemById.get(key.slice(0, 6)), opt = item?.options.find(o => o.key === key)
        if (!opt) { problems.push(`Q2.3: unknown option ${key} in quantities`); continue }
        scope.quantities.push({ id: item.id, name: item.name, pick: item.pick, key, label: opt.label, qty: m[2].replace(/,/g, '') })
      }
      continue
    }
    if (blank(it.value) && it.q !== 'Q1.3') continue
    let value = it.value
    if (MULTI.has(it.q)) {
      const { values, leftover } = pickOptions(value, lists[it.q] || [])
      if (leftover) problems.push(`${it.q}: couldn't match "${leftover}" to an option (${(lists[it.q] || []).join(' | ')})`)
      value = values
    } else if (lists[it.q] && !lists[it.q].includes(value)) {
      problems.push(`${it.q}: "${value}" is not an option (${lists[it.q].join(' | ')})`)
    }
    if (it.q === 'Q4.1' && value !== 'No specific deadline') value = date(value, problems, it.q)
    if (it.q === 'Q4.2') value = date(value, problems, it.q)
    if (it.q === 'Q1.2a') value = /7/.test(value) ? '7' : value.replace(/\D/g, '')
    if (it.q === 'Q4.3' || it.q === 'Q5.2' || it.q === 'Q1.5') value = value.replace(/[£,\s]/g, '')
    const step = { q: it.q, value }
    if (it.q === 'Q1.3') { const other = it.subs.find(x => /describe/i.test(x.key)); if (other) step.other = other.value }
    sections[sec].push(step)
  }
  if (ptRow.usesLevel && !get('Q2.2')) problems.push('Q2.2: level of intervention is required for this type')
  if (!scope) problems.push('Q2.3: no scope given')
  return { problems, notes, plan: { id, projectType: pt, sections, scope } }
}

const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(ROOT).filter(d => /^[A-Z]{2}-\d-/.test(d)).sort()
let bad = 0
for (const id of ids) {
  const { problems, notes = [], plan } = build(id)
  if (problems.length) { bad++; console.log(`✗ ${id}\n  - ${problems.join('\n  - ')}`) }
  else { fs.writeFileSync(path.join(ROOT, id, 'plan.json'), JSON.stringify(plan, null, 1)); console.log(`✓ ${id}${notes.length ? '  (' + notes.join('; ') + ')' : ''}`) }
}
process.exit(bad ? 1 : 0)
