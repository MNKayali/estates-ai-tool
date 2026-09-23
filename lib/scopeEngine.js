/**
 * lib/scopeEngine.js — the Scope of works rules, in one place.
 *
 * Pure JS, no React, no node-only imports: the questionnaire (client) and the
 * cost engine (server) both run exactly this, so the item the picker ticks, the
 * option its drop-down defaults to and the "≈ 40 toilets (estimated)" it shows
 * are the same line the report prices.
 *
 * Everything here reads the catalogue built from NRM1 v5.2 '2. Scope and Rates'
 * and '3. Settings' by lib/nrmWorkbook.js. The server's catalogue carries rate
 * rows; the client's is the same shape with the rates stripped (see
 * publicCatalogue()). Nothing in this file knows a rate, a ratio or a list —
 * those are all workbook data. What IS here is how the columns combine, which
 * is the part the workbook's own "Needs a code change" list reserves for code.
 *
 * Rule order (brief, "Build rules"): project type, then level of intervention
 * (Refurbishment and Fit-out), then building use, building age and storeys
 * ('Other conditions'), then dependencies ('When selected') as choices are made.
 */
import { ENTER, isEnter, evaluate, conditionHolds, references } from './scopeExpr.js'

// ─── Catalogue indexes ──────────────────────────────────────────────────────

const _idx = new WeakMap()
export function indexCatalogue(cat) {
  if (_idx.has(cat)) return _idx.get(cat)
  const byId = new Map(), byOption = new Map(), byOldCode = new Map(), byName = new Map()
  for (const item of cat.items) {
    byId.set(item.id, item)
    byName.set(item.name.toLowerCase(), item)
    for (const o of item.options) byOption.set(o.key, { item, option: o })
    for (const c of item.replaces || []) if (!byOldCode.has(c)) byOldCode.set(c, item.id)
  }
  const idx = { byId, byOption, byOldCode, byName }
  _idx.set(cat, idx)
  return idx
}

// ─── Context: the answers the scope rules read ──────────────────────────────

function rowByLabel(rows, label) {
  const want = String(label || '').trim().toLowerCase()
  return (rows || []).find(r => String(r.label || '').trim().toLowerCase() === want) || null
}

export function projectTypeCode(cat, label) {
  return rowByLabel(cat.settings.projectTypes, label)?.code || null
}
export function buildingUseCode(cat, label) {
  return rowByLabel(cat.settings.buildingUses, label)?.code || null
}
export function interventionLevelNumber(cat, name) {
  const row = (cat.settings.interventionLevels || []).find(r => String(r.name).trim().toLowerCase() === String(name || '').trim().toLowerCase())
  return row ? row.level : null
}
/** Does this project type ask level of intervention ('Uses level of intervention' on ▶ project_types)? */
export function projectTypeUsesLevel(cat, label) {
  return !!rowByLabel(cat.settings.projectTypes, label)?.usesLevel
}

/**
 * AGE = end year of the chosen Q1.4 band (1980–1999 → 1999); post-2000 → the
 * current year; Pre-1900 → 1899. Blank (new build, external works) stays blank,
 * so an age test such as AGE<2000 is simply false.
 */
export function ageYear(answer, now = new Date()) {
  const a = String(answer || '').trim()
  if (!a) return undefined
  if (/post/i.test(a)) return now.getFullYear()
  if (/^pre/i.test(a)) {
    const y = Number((a.match(/\d{4}/) || [])[0])
    return y ? y - 1 : undefined
  }
  const years = (a.match(/\d{4}/g) || []).map(Number)
  return years.length ? years[years.length - 1] : undefined
}

export function buildContext(cat, answers = {}, now = new Date()) {
  const PT = projectTypeCode(cat, answers.q1_2_projectType)
  const USE = buildingUseCode(cat, answers.q1_3_buildingUse)
  const usesLevel = projectTypeUsesLevel(cat, answers.q1_2_projectType)
  const LEVEL = usesLevel ? interventionLevelNumber(cat, answers.q2_3_interventionLevel) : null
  const useRow = (cat.settings.buildingUses || []).find(r => r.code === USE)
  return {
    cat, PT, USE, usesLevel, LEVEL,
    AGE: ageYear(answers.q1_4_buildingAge, now),
    // A building use whose ▶ building_uses note says every item is listed
    // (Mixed use, Other) — nothing is folded under "More items" and any item
    // can start ticked. Blank / unknown use behaves the same way.
    wildcardUse: !USE || !!useRow?.listsEverything,
    answers,
  }
}

// ─── Visibility, relevance, availability ────────────────────────────────────

/** 'Shown on' holds the project type. AUTO rows are never shown. */
export function isShown(item, ctx) {
  if (item.auto) return false
  return !!ctx.PT && item.shownOn.includes(ctx.PT)
}

/** Tagged for this building use (listed first, can start ticked); the rest sit under "More items". */
export function isRelevant(item, ctx) {
  if (ctx.wildcardUse) return true
  return item.uses.includes('ALL') || item.uses.includes(ctx.USE)
}

/** Greyed out while 'Available from intervention level' is above the chosen level. */
export function isOptionAvailable(opt, ctx) {
  if (!ctx.usesLevel || !ctx.LEVEL) return true   // not asked, or not answered yet
  return (opt.availFrom || 1) <= ctx.LEVEL
}

/** Does any of this project type's rate columns carry a rate for this option? */
export function isOptionPriceable(opt, ctx) {
  if (!opt.priceableFor) return true
  return !!opt.priceableFor[ctx.PT]
}

/** True when the workbook has no rate for this item under this project type at all. */
export function lacksRate(item, ctx) {
  return !item.options.some(o => isOptionPriceable(o, ctx))
}

/**
 * The options a drop-down offers. An option with no rate for this project type
 * could only ever be excluded, so it is left out — unless NO option has a rate,
 * in which case the item still appears ('Shown on' decides visibility, not the
 * rate columns) and the report lists it as unpriced. That is a workbook gap to
 * fill (e.g. Solar PV has no Ext Works rate), and hiding it would bury it.
 */
export function offeredOptions(item, ctx) {
  const priced = item.options.filter(o => isOptionPriceable(o, ctx))
  return priced.length ? priced : item.options
}

export function isItemAvailable(item, ctx) {
  return offeredOptions(item, ctx).some(o => isOptionAvailable(o, ctx))
}

/** On screen at all for this project: 'Shown on' holds the project type and the row isn't automatic. */
export function isOffered(item, ctx) {
  return isShown(item, ctx) && item.options.length > 0
}

/** The lowest intervention level any offered option becomes available at — the "Requires: …" note. */
export function itemAvailableFrom(item, ctx) {
  const levels = offeredOptions(item, ctx).map(o => o.availFrom || 1)
  return levels.length ? Math.min(...levels) : 1
}

// ─── Default selection ──────────────────────────────────────────────────────

// Conditions read the same names as quantity rules; STOREYS falls to the
// ▶ inputs default (1) only when the answer is blank, so a single-storey
// default unticks upper floors, stairs and lifts.
function conditionEnv(ctx) {
  return makeQuantityEnv(ctx.cat, ctx, null)
}

/**
 * Does this item start ticked when "Use typical scope" (or its group) is used?
 * Nothing starts ticked on first load — this is only ever applied on request.
 */
export function startsTicked(item, ctx) {
  // An item the workbook can't price for this project type is never pre-ticked.
  if (!isOffered(item, ctx) || !isItemAvailable(item, ctx) || lacksRate(item, ctx)) return false
  const relevant = isRelevant(item, ctx)
  // Other conditions come after project type and level, so they can override
  // either — but only an item this building use can start ticked with.
  if (item.condition && !item.condition.auto) {
    const env = conditionEnv(ctx)
    if (conditionHolds(item.condition, env)) return item.condition.action === 'tick' ? relevant : false
  }
  const base = ctx.usesLevel
    ? !!ctx.LEVEL && offeredOptions(item, ctx).some(o => isOptionAvailable(o, ctx) && o.preLevels.includes(ctx.LEVEL))
    : item.preOn.includes(ctx.PT)
  return base && relevant
}

/** Default option(s): pre-ticked at this level, else the 'Default option' row, else the first available. */
export function defaultOptionKeys(item, ctx) {
  const avail = offeredOptions(item, ctx).filter(o => isOptionAvailable(o, ctx))
  if (avail.length === 0) return []
  const pick = list => (item.pick === 'Several' ? list : list.slice(0, 1)).map(o => o.key)
  if (ctx.usesLevel && ctx.LEVEL) {
    const pre = avail.filter(o => o.preLevels.includes(ctx.LEVEL))
    if (pre.length) return pick(pre)
  }
  const defs = avail.filter(o => o.isDefault)
  if (defs.length) return pick(defs)
  return pick(avail)
}

/** The user's own option choice where it is still valid, else the default. */
export function chosenOptionKeys(item, ctx, answers = ctx.answers) {
  const explicit = (answers?.q2_2_scopeOptions || {})[item.id]
  if (Array.isArray(explicit) && explicit.length) {
    const offered = offeredOptions(item, ctx)
    const valid = explicit.filter(k => {
      const o = offered.find(x => x.key === k)
      return o && isOptionAvailable(o, ctx)
    })
    if (valid.length) return { keys: item.pick === 'Several' ? valid : valid.slice(0, 1), explicit: true }
  }
  return { keys: defaultOptionKeys(item, ctx), explicit: false }
}

/** Typical scope for the whole project, one group, or one section of a group. */
export function typicalItemIds(cat, ctx, { groupNum, section } = {}) {
  return cat.items
    .filter(it => groupNum === undefined || it.groupNum === groupNum)
    .filter(it => section === undefined || it.section === section)
    .filter(it => startsTicked(it, ctx))
    .map(it => it.id)
}

// ─── Legacy (v4.5) codes ────────────────────────────────────────────────────

/**
 * v4.5 drafts and KV reports hold Master Cost Table codes ('3.1', '5.8a').
 * 'Replaces old codes' maps each onto the item that now covers it, so an old
 * draft reopens with the same scope ticked and a stored report can be re-run
 * by /api/compare. Codes on ▶ retired_codes, the old auto-includes and anything
 * unrecognised are dropped (returned in `dropped`).
 */
export function migrateScopeCodes(cat, codes) {
  const { byId, byOldCode } = indexCatalogue(cat)
  const ids = [], dropped = []
  for (const raw of codes || []) {
    const c = String(raw).trim()
    const id = byId.has(c) ? c : byOldCode.get(c)
    const item = id && byId.get(id)
    if (!item || item.auto) { dropped.push(c); continue }
    if (!ids.includes(id)) ids.push(id)
  }
  return { ids, dropped }
}

/** Answers with q2_2_scopeItems as Scope IDs. Idempotent; leaves every other key alone. */
export function normaliseScopeAnswers(cat, answers = {}) {
  const items = Array.isArray(answers.q2_2_scopeItems) ? answers.q2_2_scopeItems : []
  const { byId } = indexCatalogue(cat)
  if (items.every(c => byId.has(c))) return answers
  const { ids } = migrateScopeCodes(cat, items)
  return { ...answers, q2_2_scopeItems: ids }
}

// ─── Quantities ─────────────────────────────────────────────────────────────

function positive(v) {
  if (v === '' || v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** A user-entered quantity (0 allowed, blank = use the estimate). */
export function userQuantity(answers, optionKey) {
  const v = (answers?.q2_2_quantities || {})[optionKey]
  if (v === '' || v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * The quantity environment. Input names take the answer they come from (code:
 * the mapping from a name to a question is the "new input name" the workbook
 * reserves for a code change) and, when that answer is blank, the ▶ inputs
 * table's own default rule.
 */
export function makeQuantityEnv(cat, ctx, selection) {
  const inputs = cat.settings.inputs || {}
  const ratios = cat.settings.ratios || []
  const a = ctx.answers || {}
  const memo = new Map(), busy = new Set()
  const qMemo = new Map(), qBusy = new Set()

  const raw = n => {
    switch (n) {
      // On External works only, Q1.5 is asked as the site area (lib/labels.js),
      // so it is EXT_AREA there and GIFA falls to its default (0).
      case 'GIFA': return ctx.PT === 'EW' ? undefined : positive(a.q1_5_size)
      case 'STOREYS': { const s = Math.floor(Number(a.q1_2_storeys)); return s > 0 ? s : undefined }
      case 'EXT_AREA': return positive(a.q2_2_extArea) ?? (ctx.PT === 'EW' ? positive(a.q1_5_size) : undefined)
      case 'DEMOLISHED': {
        // The demolition item's own "I know this" quantity.
        const demo = cat.items.find(it => String(it.qrule).trim().toUpperCase() === 'DEMOLISHED')
        if (!demo) return undefined
        const vals = demo.options.map(o => userQuantity(a, o.key)).filter(v => v !== undefined)
        return vals.length ? vals.reduce((s, v) => s + v, 0) : undefined
      }
      default: return undefined   // FOOTPRINT, UPPER: always worked out
    }
  }

  const env = {
    name(n) {
      if (n === 'PT') return ctx.PT
      if (n === 'USE') return ctx.USE
      if (n === 'AGE') return ctx.AGE
      if (n === 'LEVEL') return ctx.LEVEL
      if (memo.has(n)) return memo.get(n)
      if (busy.has(n)) throw new Error(`input ${n} depends on itself`)
      busy.add(n)
      let v = raw(n)
      if (v === undefined) {
        const def = inputs[n]?.default
        v = def ? evaluate(def, env) : undefined
      }
      busy.delete(n)
      memo.set(n, v)
      return v
    },
    ratio(key) {
      const rows = ratios.filter(r => r.key === key)
      const row = rows.find(r => r.use === ctx.USE) || rows.find(r => r.use === 'ALL')
      return row ? row.value : undefined
    },
    q(id) {
      if (qMemo.has(id)) return qMemo.get(id)
      if (qBusy.has(id)) throw new Error(`Q(${id}) depends on itself`)
      const sel = selection?.get(id)
      if (!sel) return 0
      qBusy.add(id)
      let total = 0
      for (const line of sel.lines(env)) {
        if (isEnter(line.qty)) { total = ENTER; break }
        total += line.qty
      }
      qBusy.delete(id)
      qMemo.set(id, total)
      return total
    },
  }
  return env
}

/** The worked-out inputs, for display ("Footprint 1,333 m²") and the report. */
export function resolvedInputs(env) {
  const out = {}
  for (const n of ['GIFA', 'STOREYS', 'FOOTPRINT', 'UPPER', 'EXT_AREA', 'DEMOLISHED']) {
    let v
    try { v = env.name(n) } catch { v = undefined }
    out[n] = isEnter(v) ? null : (v ?? null)
  }
  return out
}

/** Does this option's quantity estimate rest on a ▶ quantity_ratios figure (people per WC, m² per dwelling …)? */
export function estimateUsesRatio(item, opt) {
  const rule = String(opt.qrule || item.qrule || '').trim()
  if (!rule) return false
  try { return references(rule).ratios.size > 0 } catch { return false }
}

function estimate(item, opt, env) {
  const rule = String(opt.qrule || item.qrule || '').trim()
  if (!rule) return ENTER
  const v = evaluate(rule, env)
  if (isEnter(v)) return ENTER
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : ENTER
}

// ─── Effects ('When selected') ──────────────────────────────────────────────

function effectApplies(effect, ctx) {
  return !effect.projectTypes || effect.projectTypes.includes(ctx.PT)
}

/** Items a choice suggests ticking (SUGGEST), offered and available for this project. */
export function suggestedItemIds(cat, ctx, item, optionKeys) {
  const { byId } = indexCatalogue(cat)
  const out = []
  for (const k of optionKeys) {
    const o = item.options.find(x => x.key === k)
    for (const e of o?.effects || []) {
      if (e.type !== 'SUGGEST' || !effectApplies(e, ctx)) continue
      const t = byId.get(e.target)
      if (t && isOffered(t, ctx) && isItemAvailable(t, ctx) && !out.includes(t.id)) out.push(t.id)
    }
  }
  return out
}

// ─── The resolved selection ─────────────────────────────────────────────────

/**
 * Everything the picker shows and the engine prices, from the answers.
 *
 * Returns:
 *   ctx, env, inputs
 *   items: [{ item, optionKeys, explicitOptions, lines: [{ option, optionKey, qty, qtySource, estimate }] }]
 *          — ticked, offered and available items only, in catalogue order
 *   notOffered:   ticked IDs this project type doesn't offer
 *   unavailable:  ticked IDs that need a higher level of intervention
 *   unknown:      ticked codes the catalogue doesn't recognise
 *   effects:      { risks, assumptions } from 'When selected', each with the item it came from
 *   rateBumps:    Map(targetItemId → bands up), already applied to the target's default option
 */
export function resolveSelection(cat, answers = {}, now = new Date()) {
  const norm = normaliseScopeAnswers(cat, answers)
  const ctx = buildContext(cat, norm, now)
  const { byId, byName } = indexCatalogue(cat)
  const ticked = Array.isArray(norm.q2_2_scopeItems) ? norm.q2_2_scopeItems : []
  const legacyDropped = Array.isArray(answers.q2_2_scopeItems)
    ? answers.q2_2_scopeItems.filter(c => !byId.has(c) && !migrateScopeCodes(cat, [c]).ids.length)
    : []

  const notOffered = [], unavailable = [], unknown = [...legacyDropped]
  const chosen = []
  for (const it of cat.items) {
    if (!ticked.includes(it.id)) continue
    if (!isOffered(it, ctx)) { notOffered.push(it.id); continue }
    if (!isItemAvailable(it, ctx)) { unavailable.push(it.id); continue }
    const { keys, explicit } = chosenOptionKeys(it, ctx, norm)
    if (keys.length === 0) { unavailable.push(it.id); continue }
    chosen.push({ item: it, optionKeys: keys, explicitOptions: explicit })
  }
  for (const id of ticked) if (!byId.has(id) && !unknown.includes(id)) unknown.push(id)

  // RATE effects: "Electricity supply upgrade one band up". Applied to the
  // target's option only while it is on its default — a size the user picked
  // themselves is theirs. Several sources bump once, not once each: a heat pump
  // and EV charging are one capacity question for the DNO, not two.
  const rateBumps = new Map()
  const bumpSources = new Map()
  for (const c of chosen) {
    for (const k of c.optionKeys) {
      const o = c.item.options.find(x => x.key === k)
      for (const e of o?.effects || []) {
        if (e.type !== 'RATE' || !effectApplies(e, ctx)) continue
        const target = byName.get(String(e.targetName || '').toLowerCase())
        if (!target) continue
        rateBumps.set(target.id, Math.max(rateBumps.get(target.id) || 0, e.bands || 1))
        if (!bumpSources.has(target.id)) bumpSources.set(target.id, [])
        bumpSources.get(target.id).push(c.item.name)
      }
    }
  }
  for (const c of chosen) {
    const bands = rateBumps.get(c.item.id)
    if (!bands || c.explicitOptions || c.item.pick === 'Several') continue
    const offered = offeredOptions(c.item, ctx).filter(o => isOptionAvailable(o, ctx))
    const at = offered.findIndex(o => o.key === c.optionKeys[0])
    if (at < 0) continue
    const to = Math.min(offered.length - 1, at + bands)
    if (to !== at) {
      c.optionKeys = [offered[to].key]
      c.bumpedBy = bumpSources.get(c.item.id)
    }
  }

  const selection = new Map()
  let env
  for (const c of chosen) {
    c.lines = e => c.optionKeys.map(k => {
      const option = c.item.options.find(o => o.key === k)
      const user = userQuantity(norm, k)
      const est = estimate(c.item, option, e)
      return {
        option, optionKey: k,
        qty: user !== undefined ? user : est,
        qtySource: user !== undefined ? 'user' : 'estimate',
        estimate: est,
        usesRatio: estimateUsesRatio(c.item, option),
      }
    })
    selection.set(c.item.id, c)
  }
  env = makeQuantityEnv(cat, ctx, selection)
  const items = chosen.map(c => ({ ...c, lines: c.lines(env) }))

  const risks = [], assumptions = []
  for (const c of items) {
    for (const l of c.lines) {
      for (const e of l.option.effects || []) {
        if (!effectApplies(e, ctx)) continue
        if (e.type === 'RISK') risks.push({ itemId: c.item.id, item: c.item.name, optionKey: l.optionKey, text: e.text })
        if (e.type === 'ASSUME') assumptions.push({ itemId: c.item.id, item: c.item.name, optionKey: l.optionKey, text: e.text })
      }
    }
    if (c.bumpedBy) {
      assumptions.push({ itemId: c.item.id, item: c.item.name, text: `${c.item.name} priced one size band up because ${[...new Set(c.bumpedBy)].join(' and ')} ${c.bumpedBy.length > 1 ? 'are' : 'is'} selected` })
    }
  }
  const dedupe = list => list.filter((x, i) => list.findIndex(y => y.itemId === x.itemId && y.text === x.text) === i)

  return {
    ctx, env, inputs: resolvedInputs(env), items,
    notOffered, unavailable, unknown,
    effects: { risks: dedupe(risks), assumptions: dedupe(assumptions) },
    rateBumps,
  }
}

// ─── Hand-offs to engines that still speak v4.5 ─────────────────────────────

/**
 * What the programme engine needs to know about the scope. It tests v4.5 codes
 * ('0.2' demolition, '7.1' structural repairs, roof codes …) and keywords, so it
 * gets the v4.5 codes each ticked item replaces plus the item names — and a true
 * count of Group 5 items, because one v5.2 item (Heating) replaces three v4.5
 * codes and would otherwise count as three M&E items.
 */
export function scopeSummary(resolved) {
  const items = resolved.items || []
  const codes = [...new Set(items.flatMap(c => c.item.replaces || []))]
  const names = items.map(c => c.item.name.toLowerCase())
  const { ctx } = resolved
  const levelRow = ctx?.usesLevel && ctx.LEVEL
    ? (ctx.cat?.settings.interventionLevels || []).find(l => l.level === ctx.LEVEL)
    : null
  return {
    ids: items.map(c => c.item.id),
    codes,
    tokens: [...codes, ...names],
    meItemCount: items.filter(c => c.item.groupNum === 5 && !c.item.auto).length,
    // The level of intervention the cost was priced at — null where the
    // project type doesn't use one (▶ project_types), even if a stale answer
    // is still stored (an Extension draft from before September 2026). The
    // programme reads this rather than the raw answer, so cost and design
    // duration can never disagree about whether a level applies.
    interventionLevel: levelRow ? levelRow.name : null,
  }
}
