/**
 * costCalculator.js — Deterministic NRM1 cost engine.
 * All numbers come from the NRM1 workbook (v5.2, see lib/nrmWorkbook.js).
 * The AI never sees this code and never touches these numbers.
 *
 * The scope rules — which items are ticked, which option each prices at, and
 * the quantity each carries — live in lib/scopeEngine.js, shared with the
 * questionnaire, so the line the picker shows is the line priced here. This
 * file turns those lines into money:
 *
 *   line = rate × quantity × location factor × band multiplier
 *
 * where the rate is the option's row for the building use (else ALL) in the
 * project type's column at the chosen specification level, and the last two
 * factors apply only where the row says 'Apply band + location factor' = Yes.
 * No extent or intervention percentage goes on top. Modular construction
 * (Group 2 header) multiplies the groups ▶ factors names by modular_factor.
 */
import { loadNrmWorkbook, publicCatalogue, columnsFor } from './nrmWorkbook.js'
import { resolveSelection, scopeSummary, projectTypeCode } from './scopeEngine.js'
import { isEnter, evaluate } from './scopeExpr.js'
import { isHigherRiskBuilding } from './siteContext.js'
import { matchRegion } from './postcodeRegion.js'

// Explicit fallback — the range every report carried before a range-width
// table existed. Used only when '3. Settings' has no ▶ range_widths row for the
// grade (the table was added in workbook v5.3; v5.2 had none).
const LEGACY_RANGE = { low: 0.89, high: 1.11 }

// ─── Location factor ─────────────────────────────────────────────────────────

function getLocation(postcode, regions, explicitRegion) {
  // An explicit Q1.1 region wins. The questionnaire only asks for one when the
  // postcode prefix matched nothing, so this is the user confirming the location
  // rather than the silent default below deciding for them.
  if (explicitRegion) {
    const chosen = regions.find(r => r.region === explicitRegion && r.mid > 0)
    if (chosen) return { factor: chosen.mid, region: chosen.region, matched: true }
  }
  // Most specific entry wins (district over area) — lib/postcodeRegion.js,
  // shared with the questionnaire so both always land on the same region.
  const match = matchRegion(postcode, regions.filter(r => r.mid > 0))
  if (match) return { factor: match.mid, region: match.region, matched: true }
  // The ★ DEFAULT region (the loader rejects a workbook without exactly one).
  // `matched: false` is surfaced as a sense-check warning — a typo'd postcode
  // silently priced at the default would understate a London project by ~30%.
  const def = regions.find(r => r.isDefault)
  return { factor: def.mid, region: def.region, matched: false }
}

// "Groups 1–3 rates" → [1, 2, 3]
function groupsNamed(text) {
  const m = String(text || '').match(/groups?\s*(\d+)\s*(?:[–—-]\s*(\d+))?/i)
  if (!m) return []
  const lo = Number(m[1]), hi = m[2] !== undefined ? Number(m[2]) : lo
  const out = []
  for (let g = lo; g <= hi; g++) out.push(g)
  return out
}

function rowForUse(option, useCode) {
  return option.rows.find(r => useCode && r.uses.includes(useCode)) ||
    option.rows.find(r => r.uses.includes('ALL')) || option.rows[0]
}

// Lines on BCIS element 12 (other development / project costs — biodiversity
// net gain) print below the construction total, per '1. Instructions' step 5.
const isBelowLine = item => item.bcis.length > 0 && item.bcis.every(b => String(b.element).split('.')[0] === '12')

function optionSuffix(item, option) {
  if (item.options.length <= 1 && /^standard$/i.test(option.label)) return ''
  // "Raised access floor: No" keeps its name; "System: Air source heat pump" doesn't need it.
  return ` — ${option.dims.map(d => (d.dim && /^(yes|no)$/i.test(d.value) ? `${d.dim}: ${d.value}` : d.value)).join(', ')}`
}

// ─── Percentage rules evaluation ─────────────────────────────────────────────

// `opts.meItemCount` is the number of ticked Group 5 items, counted by the
// scope engine (one v5.2 item can replace several v4.5 codes, so the old
// per-code count would overstate it).
export function evaluatePercentageRules(rules, answers, worksTotal, programmeWeeks, constructionWeeks = 0, opts = {}) {
  const knownIssues = answers.q3_1_knownIssues || []
  const accessConstraints = answers.q3_5_accessConstraints || []

  // Trading premises are inherently time-restricted: works in a live shop, café or
  // hotel must fit around opening hours, so restricted working hours apply even if
  // the user did not tick Q3.5. Drives the Code-A prelims uplift below.
  // Only while the premises trade: a vacant or decanted unit has no opening
  // hours to work around (test report FO-3, a vacant hospitality unit, carried
  // "+0.5% for restricted working hours" against a scaffold-licence answer).
  const RESTRICTED_USES = new Set(['Retail', 'Hospitality / leisure'])
  const trading = !/vacant|decanted/i.test(String(answers.q3_6_occupation || ''))
  const tickedRestricted = accessConstraints.some(a => a.toLowerCase().includes('restricted working'))
  const inferredRestricted = trading && RESTRICTED_USES.has(answers.q1_3_buildingUse || '')

  // Handle both legacy string and new array for planning consents
  const _planning = answers.q3_4_planningConsents
  const planningStr = Array.isArray(_planning) ? _planning.join(' | ') : (_planning || '')

  // Handle both legacy string and new array for surveys.
  //
  // An EMPTY answer counts as "none". Q3.3 is optional, and blank used to mean
  // two different things at once: computeConfidence() downgraded the grade for
  // having no surveys, while this matcher required the literal "None" and so
  // skipped the workbook's +2pp risk and +0.5pp developer-cost rows. A report
  // could therefore say "Grade C — no surveys commissioned" while pricing the
  // project as though surveys were in hand. The two now agree, without forcing
  // the user to answer.
  const _surveys = answers.q3_3_surveys
  const surveysArr = Array.isArray(_surveys) ? _surveys : (_surveys ? [_surveys] : [])
  const noSurveys = surveysArr.length === 0 ||
    surveysArr.includes('None') || surveysArr.includes('None yet') || _surveys === 'None yet'

  // Workbook rule conditions whose text matched none of the evaluator branches
  // below. A reworded Tab 3 condition would otherwise silently evaluate false
  // (and the percentage silently change), breaking the "edit the workbook, not
  // the code" guarantee — so unmatched conditions are surfaced via senseCheck.
  const unmatchedConditions = new Set()

  // `weeksOverride` lets a caller evaluate the duration-band conditions against a
  // component-specific span (e.g. weeks-to-tender or construction-only weeks)
  // instead of the full programme. Defaults to the full programme length.
  function checkCondition(condition, weeksOverride) {
    const c = condition.toLowerCase()
    const pw = weeksOverride != null ? weeksOverride : (programmeWeeks || 0)
    if (c.includes('fully occupied throughout') || c.includes('q3.6 = fully occupied'))
      return (answers.q3_6_occupation || '').toLowerCase().includes('fully occupied') ||
             (answers.q3_6_occupation || '').toLowerCase().includes('fully occupied')
    if (c.includes('partially occupied') || c.includes('q3.6 = partially'))
      return (answers.q3_6_occupation || '').toLowerCase().includes('partially')
    if (c.includes('restricted working hours'))
      return inferredRestricted || tickedRestricted
    if (c.includes('shared access'))
      return accessConstraints.some(a => a.toLowerCase().includes('shared access'))
    if (c.includes('programme duration > 18'))
      return (programmeWeeks || 0) > 78 // 18 months ≈ 78 weeks
    if (c.includes('≥4 m&e') || c.includes('4 m&e') || c.includes('m&e-heavy'))
      return (opts.meItemCount || 0) >= 4
    if (c.includes('breeam'))
      return String(answers.q2_5_standards || '').toLowerCase().includes('breeam')
    // ── Heritage / planning ───────────────────────────────────────────────────
    // These branches test substrings of the CONDITION text to work out which rule
    // they are looking at, then test the ANSWER. Three bugs lived here, all the
    // same shape: a general pattern was reached before a specific one and answered
    // for it. Order below is deliberate — most specific first.
    const isPre1900      = (answers.q1_4_buildingAge || '').includes('Pre-1900')
    const planningLower  = planningStr.toLowerCase()
    const hasListed      = planningLower.includes('listed')
    const hasFullPlanning = planningLower.includes('full planning')

    // Q3.8 site/building context (September 2026). A higher-risk building
    // under the Building Safety Act 2022 (7+ storeys / 18 m+ with residential,
    // care or hospital use) carries Gateway 2 duties and fees; the workbook's
    // C/D/E rows for it key on the token "higher-risk". Tested before the
    // planning branches so a condition that also mentions planning wording
    // can't be claimed by them first.
    if (c.includes('higher-risk') || c.includes('higher risk building'))
      return isHigherRiskBuilding(answers)

    // "Q1.4 = Pre-1900 OR Q3.4 includes Listed Building Consent" is a single rule
    // spanning two questions. It must be matched before the bare pre-1900 branch,
    // which used to swallow it and answer on age alone — so a listed 1960s
    // building got no heritage uplift at all.
    if (c.includes('pre-1900') && c.includes('listed'))
      return isPre1900 || hasListed
    if (c.includes('pre-1900'))
      return isPre1900
    if (c.includes('full planning + listed') || c.includes('listed building consent'))
      return hasListed
    // The plain "Full planning" row must not claim a listed answer: the listed
    // answer string contains "full planning", so this row (3.5%) was matching
    // first and shadowing the dedicated listed rows (4%).
    if (c.includes('full planning'))
      return hasFullPlanning && !hasListed
    if (c.includes('change of use'))
      return planningStr.toLowerCase().includes('change of use')
    if (c.includes('prior approval'))
      return planningStr.toLowerCase().includes('prior approval')
    if (c.includes('permitted development') && !c.includes('no consent'))
      return planningStr.toLowerCase().includes('permitted development')
    if (c.includes('unsure') && c.includes('pre-application'))
      return planningStr.toLowerCase().includes('unsure')
    // Every Q3.3 rule in Tab 3 is about whether any survey exists, so key on the
    // question number. This has to come before the Q3.1 branch below: the E rule
    // is worded "Q3.3 = None — surveys needed", and the generic 'surveys needed'
    // test used to catch it and answer from q3_1_knownIssues instead. That was
    // wrong in both directions — a project with no surveys missed its +2pp, and a
    // project with "Unsure" counted the same +2pp twice.
    if (c.includes('q3.3'))
      return noSurveys
    if (c.includes('q3.1 = unsure') || c.includes('surveys needed'))
      return knownIssues.some(i => i.toLowerCase().includes('unsure'))
    if (c.includes('asbestos known'))
      return knownIssues.some(i => i.toLowerCase().includes('asbestos'))
    if (c.includes('contaminated land'))
      return knownIssues.some(i => i.toLowerCase().includes('contaminated'))
    if (c.includes('structural concerns'))
      return knownIssues.some(i => i.toLowerCase().includes('structural'))
    if (c.includes('ageing') && c.includes('m&e'))
      return knownIssues.some(i => i.toLowerCase().includes('ageing') || i.toLowerCase().includes('aging'))
    if (c.includes('drainage issues'))
      return knownIssues.some(i => i.toLowerCase().includes('drainage'))
    if (c.includes('damp') || c.includes('water ingress'))
      return knownIssues.some(i => i.toLowerCase().includes('damp') || i.toLowerCase().includes('water ingress'))
    if (c.includes('fire safety'))
      return knownIssues.some(i => i.toLowerCase().includes('fire safety'))
    if (c.includes('hard deadline') || c.includes('specific date'))
      return !!(answers.q4_1_targetDate) && answers.q4_1_targetDate !== 'No specific deadline'
    if (c.includes('works cost < £1m') || c.includes('< £1m'))
      return worksTotal < 1_000_000
    if (c.includes('£1m–£5m') || c.includes('£1m-£5m'))
      return worksTotal >= 1_000_000 && worksTotal <= 5_000_000
    if (c.includes('> £5m'))
      return worksTotal > 5_000_000
    // Design-stage fee rows (Tab 3, code C BASE) name a RIBA stage in their
    // condition text — "Q4.5 = Stage 0–1 → 12–15% (use 13.5%)", "Q4.5 = Stage 2 →
    // 10–13% (use 11.5%)", and so on — and Q4.5's answers carry the same token
    // ("Concept complete (Stage 2)"). Parse the stage out of both and compare the
    // numbers, rather than substring-matching the whole condition: the previous
    // guard rejected any condition containing a "0", which the "10–13%" in the
    // Stage 2 row tripped. That row therefore never fired and the fee silently
    // fell through to the hard-coded ladder below — the workbook value was
    // ignored, and the miss surfaced as a spurious RULE_UNMATCHED warning.
    const condStage = c.match(/stage\s*(\d)\s*(?:[–—-]\s*(\d))?/)
    if (condStage) {
      const answerStage = (answers.q4_5_designStage || '')
        .toLowerCase().match(/stage\s*(\d)\s*(?:[–—-]\s*(\d))?/)
      if (!answerStage) return false
      // A condition may name a range ("Stage 0–1"); the answer matches when its
      // first stage number falls inside that range.
      const lo = Number(condStage[1])
      const hi = condStage[2] !== undefined ? Number(condStage[2]) : lo
      const answered = Number(answerStage[1])
      return answered >= lo && answered <= hi
    }
    if (c.includes('0–6 months') || c.includes('0 – 6'))
      return pw <= 26
    if (c.includes('6–12 months') || c.includes('6 – 12'))
      return pw > 26 && pw <= 52
    if (c.includes('12–18') || c.includes('12 – 18'))
      return pw > 52 && pw <= 78
    if (c.includes('18+') || c.includes('18 months →'))
      return pw > 78
    if (c.includes('≤ 6 months') || c.includes('<= 6'))
      return pw <= 26
    if (c.includes('6–12') && c.includes('construction'))
      return pw > 26 && pw <= 52
    if (c.includes('12–18') && c.includes('construction'))
      return pw > 52 && pw <= 78
    if (c.includes('18–24') || c.includes('18 – 24'))
      return pw > 78 && pw <= 104
    if (c.includes('24+') && c.includes('construction'))
      return pw > 104
    if (c.includes('always 5%') || c.includes('fixed'))
      return true
    if (c.includes('base'))
      return true // BASE rows are always active
    if (condition.trim()) {
      unmatchedConditions.add(condition.trim())
      console.warn(`[costCalculator] Percentage rule condition matched no evaluator branch: "${condition.trim()}" — rule treated as not applicable`)
    }
    return false
  }

  // ── Rule trace ────────────────────────────────────────────────────────────
  // Every rule that contributes to a percentage is recorded here, in the order
  // it was applied, with the workbook's own condition text as the label. The
  // report renders this as a build-up table ("8% base + 2% fully occupied +
  // 0.5% restricted hours = 10.5%") so a reader can audit each percentage
  // against Tab 3 instead of trusting a bare total. Caps are recorded as a
  // negative final entry so each list still sums to the applied figure.
  const trace = { prelims: [], ohp: [], fees: [], devCosts: [], risk: [], contingency: [], inflation: [] }
  const hit = (key, code, label, pct) => trace[key].push({ code, label: String(label || '').trim(), pct })
  const capped = (key, code, total, cap) => {
    if (total > cap) hit(key, code, `Capped at ${cap}%`, Math.round((cap - total) * 100) / 100)
  }

  // ── Code A: Prelims ──────────────────────────────────────────────────────
  const aRules = rules.filter(r => r.code === 'A')
  const aBase = aRules.find(r => r.type === 'BASE')
  let aTotal = aBase ? aBase.adjustPct : 8
  hit('prelims', 'A', aBase ? aBase.condition : 'Base (fallback — no BASE row in workbook)', aTotal)
  const aCap = aBase ? aBase.capPct : 10
  for (const r of aRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) {
      aTotal += r.adjustPct
      // Say when the rule fired on the building use rather than a Q3.5 tick,
      // so the build-up doesn't read as an answer the client never gave.
      const assumed = /restricted working hours/i.test(r.condition) && !tickedRestricted
      hit('prelims', 'A', assumed ? `${r.condition} (assumed for trading ${String(answers.q1_3_buildingUse).toLowerCase()} premises)` : r.condition, r.adjustPct)
    }
  }
  capped('prelims', 'A', aTotal, aCap)
  const prelims = Math.min(aTotal, aCap)

  // ── Code B: OH&P ─────────────────────────────────────────────────────────
  const bRules = rules.filter(r => r.code === 'B' && r.type === 'RANGE')
  let ohp = 11 // default < £1M
  let bHit = null
  for (const r of bRules) {
    if (checkCondition(r.condition)) { ohp = r.adjustPct; bHit = r; break }
  }
  hit('ohp', 'B', bHit ? bHit.condition : 'Default < £1M (fallback — no RANGE row matched)', ohp)

  // ── Code C: Professional Fees ────────────────────────────────────────────
  const cRules = rules.filter(r => r.code === 'C')
  const cBase = cRules.find(r => r.type === 'BASE' && checkCondition(r.condition))
  // Explicit design-stage fallback — workbook BASE row is authoritative when matched.
  // The hard-coded ladder below (6 / 8.5 / 11.5 / 13.5%) fires ONLY when no Tab 3
  // BASE row matches the design stage; it is a safety net, not the primary source.
  let cTotal
  if (cBase) {
    cTotal = cBase.adjustPct
    hit('fees', 'C', cBase.condition, cTotal)
  } else {
    const ds = (answers.q4_5_designStage || '').toLowerCase()
    if (ds.includes('stage 4') || ds.includes('technical')) cTotal = 6
    else if (ds.includes('stage 3') || ds.includes('developed')) cTotal = 8.5
    else if (ds.includes('stage 2') || ds.includes('concept complete')) cTotal = 11.5
    else cTotal = 13.5
    hit('fees', 'C', `Design-stage fee ladder (fallback — no BASE row matched "${answers.q4_5_designStage || 'Stage 0–1'}")`, cTotal)
  }
  for (const r of cRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) { cTotal += r.adjustPct; hit('fees', 'C', r.condition, r.adjustPct) }
  }

  // ── Code D: Developer & Project Costs ────────────────────────────────────
  const dRules = rules.filter(r => r.code === 'D')
  // NRM1 Tab 3 has no D row for "no consent" — default must be 0, not 3.
  let dTotal = 0
  const planningAnswer = String(answers.q3_4_planningConsents || '').toLowerCase()
  const hasPlanning = planningAnswer !== '' && planningAnswer !== 'none' && !planningAnswer.includes('no consent')
  if (hasPlanning) {
    const dBase = dRules.find(r => r.type === 'BASE' && checkCondition(r.condition))
    if (dBase) { dTotal = dBase.adjustPct; hit('devCosts', 'D', dBase.condition, dBase.adjustPct) }
    for (const r of dRules.filter(r => r.type === 'ADD')) {
      if (checkCondition(r.condition)) { dTotal += r.adjustPct; hit('devCosts', 'D', r.condition, r.adjustPct) }
    }
  } else {
    hit('devCosts', 'D', 'No planning consent required (Q3.4) — no developer costs applied', 0)
  }

  // ── Code E: Risk Allowance ────────────────────────────────────────────────
  const eRules = rules.filter(r => r.code === 'E')
  const eBase = eRules.find(r => r.type === 'BASE')
  let eTotal = eBase ? eBase.adjustPct : 5
  hit('risk', 'E', eBase ? eBase.condition : 'Baseline (fallback — no BASE row in workbook)', eTotal)
  const eCap = eBase ? eBase.capPct : 10
  for (const r of eRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) { eTotal += r.adjustPct; hit('risk', 'E', r.condition, r.adjustPct) }
  }
  capped('risk', 'E', eTotal, eCap)
  const risk = Math.min(eTotal, eCap)

  // ── Code H: Contingency ────────────────────────────────────────────────────
  const hRule = rules.find(r => r.code === 'H' && r.type === 'FIXED')
  const contingency = hRule ? hRule.adjustPct : 5
  hit('contingency', 'H', hRule ? hRule.condition : 'Fixed 5% (fallback — no FIXED row in workbook)', contingency)

  // ── Code G: VAT (reference only) ──────────────────────────────────────────
  // Read from the workbook's G row rather than a 0.20 literal so the VAT rate
  // lives in exactly one place. Never added to the total — the report shows it
  // for reference, and budgetVerdict() uses it to gross up the estimate
  // against a budget stated inclusive of VAT.
  const gRule = rules.find(r => r.code === 'G')
  const vatPct = gRule && gRule.adjustPct > 0 ? gRule.adjustPct : 20

  // ── Code F: Inflation ──────────────────────────────────────────────────────
  // Inflation has two components, each keyed to its OWN span — not the full
  // programme. The tender-delay rows are evaluated against weeks-to-tender, and
  // the construction rows against construction-only weeks, via checkCondition's
  // weeksOverride. (On the first pass constructionWeeks is 0; the cost is re-run
  // after the programme is known.)
  const fRules = rules.filter(r => r.code === 'F')
  const fCap = fRules[0]?.capPct || 12
  // Time to tender ≈ everything up to construction (design + survey + procurement).
  const weeksToTender = Math.max(0, (programmeWeeks || 0) - constructionWeeks - 2)
  const tenderDelayRules = fRules.filter(r => r.condition.toLowerCase().includes('tender'))
  let tenderInflation = 0
  for (const r of tenderDelayRules) {
    if (checkCondition(r.condition, weeksToTender)) {
      tenderInflation = r.adjustPct
      hit('inflation', 'F', `${r.condition} (${weeksToTender} wks to tender)`, r.adjustPct)
      break
    }
  }
  // Construction mid-point component
  const constructionRules = fRules.filter(r => r.condition.toLowerCase().includes('construction'))
  let constructionInflation = 0
  for (const r of constructionRules) {
    if (checkCondition(r.condition, constructionWeeks)) {
      constructionInflation = r.adjustPct
      hit('inflation', 'F', `${r.condition} (${constructionWeeks} wks construction)`, r.adjustPct)
      break
    }
  }
  capped('inflation', 'F', tenderInflation + constructionInflation, fCap)
  const inflation = Math.min(tenderInflation + constructionInflation, fCap)

  // ── Risk level badge ──────────────────────────────────────────────────────
  // Presentation-only RAG banding of the (workbook-derived) risk %. These
  // thresholds are a display convenience, not a priced figure.
  const riskLevel = risk <= 6 ? 'Low' : risk <= 8 ? 'Medium' : 'High'

  return {
    percentages: { prelims, ohp, fees: cTotal, devCosts: dTotal, risk, contingency, inflation, riskLevel },
    vatPct,
    trace,
    unmatchedConditions: [...unmatchedConditions],
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * @param {object} answers            questionnaire answers (v5.2 Scope IDs, or
 *                                    v4.5 codes from an older draft/report —
 *                                    translated through 'Replaces old codes')
 * @param {number} programmeWeeks     total programme weeks (0 on the first pass)
 * @param {number} constructionWeeks  construction-only weeks (0 on the first pass)
 * @param {object} [opts]
 * @param {string} [opts.rangeGrade]  deterministic confidence grade (A–D). When
 *   given and '3. Settings' has a ▶ range_widths row for it, that row's low/high
 *   factors set the estimate range; otherwise the legacy ±11% applies. The
 *   grade is only known after the sense check, so generate-report runs the
 *   cost a final time with it once confidence has been computed.
 */
export async function calculateCost(answers, programmeWeeks, constructionWeeks = 0, opts = {}) {
  const model = await loadNrmWorkbook()
  const s = model.settings
  const rangeGrade = opts.rangeGrade ? String(opts.rangeGrade).toUpperCase() : null
  const rangeFromWorkbook = !!(rangeGrade && s.rangeWidths?.[rangeGrade])
  const range = rangeFromWorkbook ? s.rangeWidths[rangeGrade] : LEGACY_RANGE

  const resolved = resolveSelection(model, answers)
  const { ctx } = resolved
  const projectType = answers.q1_2_projectType || ''
  const ptRow = s.projectTypes.find(p => p.code === ctx.PT)
  if (!ptRow) throw new Error(`Project type "${projectType}" is not on '3. Settings' ▶ project_types`)
  const specNames = s.specLevels.map(l => l.level)
  const specLevel = specNames.includes(answers.q2_4_specLevel) ? answers.q2_4_specLevel : 'Standard'

  const loc = getLocation(answers.q1_1_postcode, s.locationFactors, answers.q1_1_bcisRegion)
  const levelRow = ctx.usesLevel && ctx.LEVEL ? s.interventionLevels.find(l => l.level === ctx.LEVEL) : null
  // Band multiplier: level of intervention, Refurbishment and Fit-out only.
  // Unanswered (the form requires it; an API caller may not) prices at 1.
  const bandFactor = levelRow ? levelRow.band : 1
  const interventionLevel = ctx.usesLevel ? (levelRow?.name || answers.q2_3_interventionLevel || null) : null

  const modular = answers.q2_2_constructionMethod === 'Modular' && s.factors.modular_factor
    ? { factor: s.factors.modular_factor.value, groups: groupsNamed(s.factors.modular_factor.appliesTo) }
    : null

  const [primaryCol, fallbackCol] = columnsFor(s, ctx.PT, specLevel)

  // Every ticked Scope ID must end up priced, excluded with a reason, or
  // adjusted with a reason — see the reconciliation invariant below.
  const adjustments = []
  const excludedNoQuantity = []
  const rateFallbacks = []
  const lineItems = []
  const belowLineItems = []
  const autoIncludes = []
  const ptLabel = ptRow.label

  for (const id of resolved.notOffered) {
    const it = model.items.find(i => i.id === id)
    adjustments.push({ code: id, reason: `${it?.name || id} is not offered for ${ptLabel} ('Shown on' in the workbook) — not priced` })
  }
  for (const id of resolved.unavailable) {
    const it = model.items.find(i => i.id === id)
    adjustments.push({ code: id, reason: `${it?.name || id} needs a higher level of intervention than "${interventionLevel}" — not priced` })
  }
  for (const code of resolved.unknown) {
    adjustments.push({ code, reason: 'not in the NRM1 v5.2 scope catalogue (retired or unrecognised code) — not priced' })
  }

  const priceLine = (item, option, qty, qtySource, estimate, usesRatio = false) => {
    const row = rowForUse(option, ctx.USE)
    let rate = row.rates[primaryCol] || 0
    if (!(rate > 0) && fallbackCol && (row.rates[fallbackCol] || 0) > 0) {
      rate = row.rates[fallbackCol]
      rateFallbacks.push(item.id)
    }
    const description = `${item.name}${optionSuffix(item, option)}`
    if (!(rate > 0)) {
      excludedNoQuantity.push({ code: item.id, rateKey: row.key, description, reason: `no rate for ${ptLabel} in the workbook (${primaryCol} column)` })
      return null
    }
    if (isEnter(qty)) {
      excludedNoQuantity.push({ code: item.id, rateKey: row.key, description, reason: 'selected but no quantity provided — the workbook has no reliable estimate, so enter one in "I know this"' })
      return null
    }
    if (!(qty > 0)) {
      excludedNoQuantity.push({
        code: item.id, rateKey: row.key, description,
        reason: qtySource === 'user' ? 'your quantity is zero' : 'quantity computes to zero for this building (e.g. no upper floors on a single-storey building)',
      })
      return null
    }
    const factor = (option.band ? loc.factor * bandFactor : 1) *
      (modular && modular.groups.includes(item.groupNum) ? modular.factor : 1)
    const midRate = rate * factor
    const lineMid = midRate * qty
    return {
      code: item.id,
      rateKey: row.key,
      group: item.groupNum,
      groupLabel: item.groupLabel,
      section: item.section,
      item: item.name,
      option: option.label,
      description,
      unit: option.unit || item.unit,
      source: row.source,
      aiEstimate: /ai estimate/i.test(row.source),
      qty: Math.round(qty * 10) / 10,
      qtySource,
      // Priced on a count estimated from a ▶ quantity_ratios figure rather
      // than a figure the user gave — lowers confidence until confirmed.
      ratioEstimate: qtySource === 'estimate' && usesRatio,
      estimate: isEnter(estimate) ? null : Math.round(estimate * 10) / 10,
      rate: Math.round(midRate * 100) / 100,
      rateLow: Math.round(midRate * range.low * 100) / 100,
      rateHigh: Math.round(midRate * range.high * 100) / 100,
      lineMid: Math.round(lineMid),
      lineLow: Math.round(lineMid * range.low),
      lineHigh: Math.round(lineMid * range.high),
      bcis: item.bcis,
      _mid: lineMid,
    }
  }

  for (const c of resolved.items) {
    for (const l of c.lines) {
      const li = priceLine(c.item, l.option, l.qty, l.qtySource, l.estimate, l.usesRatio)
      if (li) (isBelowLine(c.item) ? belowLineItems : lineItems).push(li)
    }
  }

  // Automatic rows ('Other conditions' = AUTO), e.g. builder's work in
  // connection "when any Group 5 item is selected" — added only when a real
  // line in that group was priced, so an excluded item can't trigger a phantom
  // line. Declared in autoIncludes with the workbook's own wording.
  for (const auto of model.items.filter(i => i.auto)) {
    const groups = groupsNamed(auto.condition.text)
    if (groups.length && !lineItems.some(li => groups.includes(li.group))) continue
    const opt = auto.options.find(o => o.isDefault) || auto.options[0]
    const est = estimateAuto(auto, opt, resolved.env)
    const li = priceLine(auto, opt, est, 'estimate', est)
    if (li) {
      lineItems.push(li)
      autoIncludes.push({ code: auto.id, reason: `${auto.name} — ${auto.condition.text.replace(/^AUTO:\s*/i, '')}` })
    } else {
      // Not ticked, so there is nothing to reconcile; drop the exclusion entry
      // priceLine may have recorded for it.
      const i = excludedNoQuantity.findIndex(e => e.code === auto.id)
      if (i >= 0) excludedNoQuantity.splice(i, 1)
    }
  }

  // ── Scope reconciliation invariant ────────────────────────────────────────
  // Every ticked item must end up priced, in excludedNoQuantity with a reason,
  // or in `adjustments` with a reason — there is no other way for a ticked item
  // to leave the estimate. Anything else is a defect here, not a user input
  // problem, so this throws rather than producing a report with a silent gap.
  const accountedFor = new Set([
    ...lineItems.map(li => li.code), ...belowLineItems.map(li => li.code),
    ...excludedNoQuantity.map(e => e.code), ...adjustments.map(a => a.code),
  ])
  const ticked = resolved.items.map(c => c.item.id)
  const unreconciled = ticked.filter(id => !accountedFor.has(id))
  if (unreconciled.length > 0) {
    throw new Error(`Scope reconciliation invariant violated: ticked item(s) ${unreconciled.join(', ')} were neither priced, excluded with a reason, nor adjusted with a declared reason. This is a costCalculator defect.`)
  }

  const order = new Map(model.items.map((it, i) => [it.id, i]))
  lineItems.sort((a, b) => a.group - b.group || order.get(a.code) - order.get(b.code))

  // q2_2_additionalScope: optional provisional sum for specialist/other scope
  const additionalScope = answers.q2_2_additionalScope
  let additionalScopeNote = null
  if (additionalScope?.text) {
    const approxVal = Number(additionalScope.approxValue) || 0
    if (approxVal > 0) {
      lineItems.push({
        code: 'PS', group: 99, groupLabel: 'Provisional sums & specialist scope',
        description: `Provisional sum — Specialist/Other scope: ${additionalScope.text}`,
        unit: 'Item', qty: 1, qtySource: 'user', source: 'Client figure',
        rate: approxVal, rateLow: approxVal, rateHigh: approxVal,
        lineMid: approxVal, lineLow: approxVal, lineHigh: approxVal, bcis: [], _mid: approxVal,
      })
    } else {
      additionalScopeNote = `Specialist/Other scope noted (no budget provided — excluded from this estimate pending further information): ${additionalScope.text}`
    }
  }

  const r1k = n => Math.round(n / 1000) * 1000
  const worksTotal = lineItems.reduce((t, li) => t + li._mid, 0)
  const worksMid  = r1k(worksTotal)
  // Derive low/high from the line-item sums so WorksTable total always matches
  // the ConstructionTable "Works Cost" row (both round the same base values).
  const worksLow  = r1k(lineItems.reduce((t, i) => t + i.lineLow,  0))
  const worksHigh = r1k(lineItems.reduce((t, i) => t + i.lineHigh, 0))

  // Works cost by BCIS element, each line split by its item's shares — so the
  // report can still total by BCIS group whatever screen group a line sits in.
  const bcisMap = new Map()
  for (const li of lineItems) {
    const splits = li.bcis?.length ? li.bcis : [{ element: String(li.group), share: 1 }]
    for (const b of splits) {
      const el = String(b.element)
      bcisMap.set(el, (bcisMap.get(el) || 0) + li._mid * b.share)
    }
  }
  const bcisTotals = [...bcisMap.entries()]
    .map(([element, amount]) => ({ element, group: Number(element.split('.')[0]), amount: Math.round(amount) }))
    .sort((a, b) => a.element.localeCompare(b.element, undefined, { numeric: true }))

  // ── Percentage additions ──────────────────────────────────────────────────
  const summary = scopeSummary(resolved)
  const { percentages: pct, vatPct, trace, unmatchedConditions } = evaluatePercentageRules(
    s.percentageRules, answers, worksMid, programmeWeeks, constructionWeeks, { meItemCount: summary.meItemCount })

  // Each displayed component is rounded to the nearest £1,000, and every subtotal
  // / total is the SUM of its already-rounded components. This guarantees the
  // report tables foot exactly (Works + Prelims + O&P = Construction Cost, etc.)
  // in every column, since the renderers round each cell the same way (f1k).
  const prelimsMid = r1k(worksMid  * pct.prelims / 100)
  const prelimsLow = r1k(worksLow  * pct.prelims / 100)
  const prelimsHigh= r1k(worksHigh * pct.prelims / 100)
  const ohpMid     = r1k(worksMid  * pct.ohp / 100)
  const ohpLow     = r1k(worksLow  * pct.ohp / 100)
  const ohpHigh    = r1k(worksHigh * pct.ohp / 100)

  const conMid     = worksMid  + prelimsMid  + ohpMid
  const conLow     = worksLow  + prelimsLow  + ohpLow
  const conHigh    = worksHigh + prelimsHigh + ohpHigh

  const feesMid    = r1k(conMid  * pct.fees / 100)
  const feesLow    = r1k(conLow  * pct.fees / 100)
  const feesHigh   = r1k(conHigh * pct.fees / 100)
  const devMid     = r1k(conMid  * pct.devCosts / 100)
  const devLow     = r1k(conLow  * pct.devCosts / 100)
  const devHigh    = r1k(conHigh * pct.devCosts / 100)
  const riskMid    = r1k(worksMid  * pct.risk / 100)
  const riskLow    = r1k(worksLow  * pct.risk / 100)
  const riskHigh   = r1k(worksHigh * pct.risk / 100)
  const contMid    = r1k(worksMid  * pct.contingency / 100)
  const contLow    = r1k(worksLow  * pct.contingency / 100)
  const contHigh   = r1k(worksHigh * pct.contingency / 100)
  const inflMid    = r1k(worksMid  * pct.inflation / 100)
  const inflLow    = r1k(worksLow  * pct.inflation / 100)
  const inflHigh   = r1k(worksHigh * pct.inflation / 100)

  // Below the construction total: BCIS 12 lines, no prelims/OH&P/percentages
  // on top, added to the project total as their own row.
  const belowLine = {
    items: belowLineItems.map(withoutMid),
    mid:  r1k(belowLineItems.reduce((t, i) => t + i._mid, 0)),
    low:  r1k(belowLineItems.reduce((t, i) => t + i.lineLow, 0)),
    high: r1k(belowLineItems.reduce((t, i) => t + i.lineHigh, 0)),
  }

  const totalMid   = conMid  + feesMid  + devMid  + riskMid  + contMid  + inflMid  + belowLine.mid
  const totalLow   = conLow  + feesLow  + devLow  + riskLow  + contLow  + inflLow  + belowLine.low
  const totalHigh  = conHigh + feesHigh + devHigh + riskHigh + contHigh + inflHigh + belowLine.high
  const vatMid     = r1k(totalMid * vatPct / 100)

  return {
    lineItems: lineItems.map(withoutMid),
    belowLine,
    bcisTotals,
    bcisFactor: loc.factor,
    bcisRegion: loc.region,
    gifa: Number(answers.q1_5_size) || 0,
    inputs: resolved.inputs,
    specLevel,
    interventionLevel,
    bandFactor,
    designMultiplier: levelRow && Number.isFinite(levelRow.designMultiplier) ? levelRow.designMultiplier : 1,
    constructionMethod: modular ? 'Modular' : 'Traditional',
    projectType,
    additionalScopeNote,
    excludedNoQuantity,
    rateFallbacks: [...new Set(rateFallbacks)],
    buildingUseHidden: [],
    autoIncludes,
    adjustments,
    scopeSummary: summary,
    scopeEffects: resolved.effects,
    bcisDefaulted: !loc.matched,
    unmatchedConditions,
    workbookVersion: model.versionLabel,
    baseDate: null,
    rangeApplied: { grade: rangeGrade, low: range.low, high: range.high, fromWorkbook: rangeFromWorkbook },
    vatPct,
    trace,
    percentages: pct,
    works:        { mid: worksMid, low: worksLow, high: worksHigh },
    construction: { mid: conMid,   low: conLow,   high: conHigh },
    total:        { mid: totalMid, low: totalLow, high: totalHigh },
    vat:          vatMid,
    breakdown: {
      prelims: prelimsMid,
      ohp:     ohpMid,
      fees:    feesMid,
      devCosts: devMid,
      risk:    riskMid,
      contingency: contMid,
      inflation:   inflMid,
      belowLine:   belowLine.mid,
    },
  }
}

// Lines carry their unrounded mid (_mid) only while totals are summed.
function withoutMid(li) {
  const out = { ...li }
  delete out._mid
  return out
}

function estimateAuto(item, option, env) {
  const rule = String(option.qrule || item.qrule || '').trim()
  if (!rule) return 0
  const v = evaluate(rule, env)
  return isEnter(v) ? v : Number(v) || 0
}

// ─── Questionnaire reference data ────────────────────────────────────────────

/**
 * The scope catalogue for the questionnaire: every item, option, rule and list
 * from the workbook, with rates and price sources stripped. The questionnaire
 * runs lib/scopeEngine.js over it, exactly as calculateCost does server-side.
 */
export async function getScopeCatalogue() {
  return publicCatalogue(await loadNrmWorkbook())
}

/**
 * Location factor regions for the questionnaire, straight from ▶ location_factors.
 *
 * Q1.1 used to be free text resolved silently server-side: an unrecognised
 * prefix fell back to the default region with only a sense-check warning, so a
 * mistyped Inner London postcode (1.25) understated the whole estimate by ~25%
 * and still produced a confident-looking report. Serving the regions lets the
 * questionnaire resolve the prefix as the user types, show which factor it
 * landed on, and ask for the region explicitly when nothing matches.
 */
export async function getBcisRegions() {
  const model = await loadNrmWorkbook()
  return model.settings.locationFactors
    .filter(r => r.mid > 0 && r.postcodes.length > 0)
    .map(r => ({ region: r.region, postcodes: r.postcodes, factor: r.mid }))
    .sort((a, b) => a.region.localeCompare(b.region))
}

/** Benchmarks and codes the sense check needs, from ▶ benchmarks. */
export async function getBenchmarkContext(answers) {
  const model = await loadNrmWorkbook()
  const s = model.settings
  const pt = projectTypeCode(model, answers?.q1_2_projectType)
  const use = s.buildingUses.find(u => u.label === answers?.q1_3_buildingUse)?.code || null
  return { bands: s.benchmarks, pt, use }
}

export { loadNrmWorkbook }
