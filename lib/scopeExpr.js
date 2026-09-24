/**
 * lib/scopeExpr.js — the small language the NRM1 v5.2 workbook writes its
 * quantity rules and conditions in, and a safe evaluator for it.
 *
 * Pure, dependency-free, imported by both the questionnaire (client) and the
 * cost engine (server), so the estimate the picker shows and the quantity the
 * report prices are the same arithmetic on the same text. Never eval().
 *
 * The language is defined on '1. Instructions' ("QUANTITY RULES"):
 *   names      GIFA · STOREYS · FOOTPRINT · UPPER · EXT_AREA · DEMOLISHED ·
 *              PT · USE · AGE · LEVEL   (defined on '3. Settings' ▶ inputs)
 *   ratios     r.name → '3. Settings' ▶ quantity_ratios (building use, else ALL)
 *   functions  IF(test, then, else) · ROUND(x, n) · MAX(a, b …) · MIN(a, b …) ·
 *              SQRT(x) · Q(S-0000) (the quantity of another item)
 *   operators  + − * /  and  = <> < > <= >=
 *   keywords   ENTER — no reliable estimate; the user must give the quantity
 *
 * Conditions ('Other conditions') are tests joined by '&', then '→ tick' or
 * '→ untick'. '=' followed by several codes means any of them:
 *   PT=NB & USE=RES STU & STOREYS>=4 → tick
 *
 * A new name or function is deliberately a code change (the workbook's own
 * "Needs a code change" list): an unknown one throws at parse time, and the
 * workbook loader parses every rule up front so a typo rejects the file instead
 * of silently pricing something at zero.
 */

/** No reliable estimate — the item is not priced until the user enters a figure. */
export const ENTER = Object.freeze({ enter: true, toString: () => 'ENTER' })
export const isEnter = v => v === ENTER

export const INPUT_NAMES = ['GIFA', 'STOREYS', 'FOOTPRINT', 'UPPER', 'EXT_AREA', 'DEMOLISHED', 'PT', 'USE', 'AGE', 'LEVEL']
const NAME_SET = new Set(INPUT_NAMES)
const FUNCTIONS = new Set(['IF', 'ROUND', 'MAX', 'MIN', 'SQRT', 'Q'])
const COMPARATORS = new Set(['=', '<>', '<', '>', '<=', '>='])

// ─── Tokeniser ───────────────────────────────────────────────────────────────

function tokenise(src) {
  const s = String(src)
    .replace(/[−–]/g, '-')        // typographic minus / en dash from Excel text
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '<>')
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^(\d+(\.\d+)?|\.\d+)/)
      if (!m) throw new Error(`bad number at "${s.slice(i)}"`)
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue
    }
    // Scope ID inside Q( … ): S-0074
    const sid = s.slice(i).match(/^S-\d{4}\b/)
    if (sid) { out.push({ t: 'sid', v: sid[0] }); i += sid[0].length; continue }
    const ratio = s.slice(i).match(/^r\.([A-Za-z_][A-Za-z0-9_]*)/)
    if (ratio) { out.push({ t: 'ratio', v: ratio[1] }); i += ratio[0].length; continue }
    const id = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue }
    const two = s.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') { out.push({ t: 'op', v: two }); i += 2; continue }
    if ('=<>+-*/(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new Error(`unexpected character "${c}"`)
  }
  return out
}

// ─── Parser (recursive descent → a small AST) ───────────────────────────────

function parse(src) {
  const toks = tokenise(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = v => toks[p] && toks[p].t === 'op' && toks[p].v === v
  const expect = v => {
    if (!isOp(v)) throw new Error(`expected "${v}" in "${src}"`)
    p++
  }

  // A bare identifier that is not an input name, function or keyword is a code
  // (NB, RES …) — only meaningful on the right of = / <>.
  const isCodeToken = t => t && t.t === 'id' && !NAME_SET.has(t.v) && !FUNCTIONS.has(t.v) && t.v !== 'ENTER'

  function comparison() {
    const left = additive()
    const t = peek()
    if (t && t.t === 'op' && COMPARATORS.has(t.v)) {
      p++
      // "PT=RF FO DM" — one or more codes. A code list is only allowed for
      // = and <>; ordering comparisons need a single value.
      if (isCodeToken(peek())) {
        const codes = []
        while (isCodeToken(peek())) codes.push(toks[p++].v)
        if ((t.v !== '=' && t.v !== '<>') && codes.length > 1) throw new Error(`"${t.v}" cannot take several codes in "${src}"`)
        return { k: 'cmp', op: t.v, left, right: { k: 'codes', v: codes } }
      }
      return { k: 'cmp', op: t.v, left, right: additive() }
    }
    return left
  }
  function additive() {
    let n = term()
    while (isOp('+') || isOp('-')) { const op = toks[p++].v; n = { k: 'bin', op, a: n, b: term() } }
    return n
  }
  function term() {
    let n = unary()
    while (isOp('*') || isOp('/')) { const op = toks[p++].v; n = { k: 'bin', op, a: n, b: unary() } }
    return n
  }
  function unary() {
    if (isOp('-')) { p++; return { k: 'neg', a: unary() } }
    return primary()
  }
  function primary() {
    const t = peek()
    if (!t) throw new Error(`unexpected end of "${src}"`)
    if (t.t === 'num') { p++; return { k: 'num', v: t.v } }
    if (t.t === 'ratio') { p++; return { k: 'ratio', v: t.v } }
    if (isOp('(')) { p++; const e = comparison(); expect(')'); return e }
    if (t.t === 'id') {
      p++
      if (t.v === 'ENTER') return { k: 'enter' }
      if (FUNCTIONS.has(t.v)) {
        expect('(')
        if (t.v === 'Q') {
          const s = peek()
          if (!s || s.t !== 'sid') throw new Error(`Q() needs a Scope ID in "${src}"`)
          p++; expect(')')
          return { k: 'q', v: s.v }
        }
        const args = []
        if (!isOp(')')) {
          args.push(comparison())
          while (isOp(',')) { p++; args.push(comparison()) }
        }
        expect(')')
        const arity = { IF: [3, 3], ROUND: [1, 2], SQRT: [1, 1], MAX: [1, 99], MIN: [1, 99] }[t.v]
        if (args.length < arity[0] || args.length > arity[1]) throw new Error(`${t.v}() takes ${arity[0]}–${arity[1]} arguments in "${src}"`)
        return { k: 'fn', f: t.v, args }
      }
      if (NAME_SET.has(t.v)) return { k: 'name', v: t.v }
      throw new Error(`unknown name "${t.v}" in "${src}" (a new input name needs a code change)`)
    }
    throw new Error(`unexpected "${t.v}" in "${src}"`)
  }

  const ast = comparison()
  if (p < toks.length) throw new Error(`unexpected "${toks[p].v}" in "${src}"`)
  return ast
}

const _cache = new Map()
export function compile(src) {
  const key = String(src).trim()
  if (!_cache.has(key)) _cache.set(key, parse(key))
  return _cache.get(key)
}

/** Every name, ratio key and Q() target a rule refers to — for validation and dependency order. */
export function references(src) {
  const refs = { names: new Set(), ratios: new Set(), items: new Set() }
  const walk = n => {
    if (!n) return
    if (n.k === 'name') refs.names.add(n.v)
    else if (n.k === 'ratio') refs.ratios.add(n.v)
    else if (n.k === 'q') refs.items.add(n.v)
    for (const c of [n.a, n.b, n.left, n.right, ...(n.args || [])]) walk(c)
  }
  walk(compile(src))
  return refs
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

const MISSING = undefined

function num(v) {
  if (isEnter(v)) return ENTER
  if (v === MISSING || v === null || v === '') return ENTER
  const n = Number(v)
  return Number.isFinite(n) ? n : ENTER
}

/**
 * @param {string} src  a quantity rule or a single test
 * @param {object} env  { name(n) → value, ratio(key) → number, q(scopeId) → number|ENTER }
 * @returns number | boolean | string | ENTER
 */
export function evaluate(src, env) {
  return ev(compile(src), env)
}

function ev(n, env) {
  switch (n.k) {
    case 'num': return n.v
    case 'enter': return ENTER
    case 'name': return env.name(n.v)
    case 'ratio': {
      const v = env.ratio(n.v)
      if (v === MISSING || v === null || !Number.isFinite(Number(v))) throw new Error(`ratio "r.${n.v}" is not defined on '3. Settings' ▶ quantity_ratios`)
      return Number(v)
    }
    case 'q': return env.q(n.v)
    case 'neg': { const a = num(ev(n.a, env)); return isEnter(a) ? ENTER : -a }
    case 'bin': {
      const a = num(ev(n.a, env)), b = num(ev(n.b, env))
      if (isEnter(a) || isEnter(b)) return ENTER
      if (n.op === '+') return a + b
      if (n.op === '-') return a - b
      if (n.op === '*') return a * b
      // A zero divisor (no storeys, no ratio) has no honest estimate.
      if (n.op === '/') return b === 0 ? ENTER : a / b
      break
    }
    case 'cmp': {
      const left = ev(n.left, env)
      if (left === MISSING || left === null || left === '' || isEnter(left)) return false
      if (n.right.k === 'codes') {
        const hit = n.right.v.some(c => String(left).toUpperCase() === c.toUpperCase())
        return n.op === '=' ? hit : !hit
      }
      const right = ev(n.right, env)
      if (right === MISSING || isEnter(right)) return false
      const bothNum = Number.isFinite(Number(left)) && Number.isFinite(Number(right))
      const l = bothNum ? Number(left) : String(left).toUpperCase()
      const r = bothNum ? Number(right) : String(right).toUpperCase()
      switch (n.op) {
        case '=': return l === r
        case '<>': return l !== r
        case '<': return l < r
        case '>': return l > r
        case '<=': return l <= r
        case '>=': return l >= r
      }
      break
    }
    case 'fn': {
      if (n.f === 'IF') {
        const test = ev(n.args[0], env)
        if (isEnter(test)) return ENTER
        return ev(test ? n.args[1] : n.args[2], env)
      }
      const args = n.args.map(a => num(ev(a, env)))
      if (args.some(isEnter)) return ENTER
      if (n.f === 'ROUND') {
        const d = args.length > 1 ? args[1] : 0
        const f = 10 ** d
        // Excel rounds half away from zero; Math.round rounds half up.
        return Math.sign(args[0]) * Math.round(Math.abs(args[0]) * f) / f
      }
      if (n.f === 'SQRT') return args[0] < 0 ? ENTER : Math.sqrt(args[0])
      if (n.f === 'MAX') return Math.max(...args)
      if (n.f === 'MIN') return Math.min(...args)
      break
    }
  }
  throw new Error(`cannot evaluate node ${n.k}`)
}

// ─── Conditions ──────────────────────────────────────────────────────────────

/**
 * Parse an 'Other conditions' cell. Returns null for blank / '—'.
 *   { auto: true, text }                      "AUTO: …" — added by the app, never shown
 *   { tests: [src…], action: 'tick'|'untick', text }
 */
export function parseCondition(raw) {
  const text = String(raw || '').trim()
  if (!text || text === '—' || text === '-') return null
  if (/^AUTO\b/i.test(text)) return { auto: true, text }
  const m = text.split(/→|->/)
  if (m.length !== 2) throw new Error(`condition "${text}" needs one "→ tick" or "→ untick"`)
  const action = m[1].trim().toLowerCase()
  if (action !== 'tick' && action !== 'untick') throw new Error(`condition "${text}" must end "→ tick" or "→ untick"`)
  const tests = m[0].split('&').map(t => t.trim()).filter(Boolean)
  if (tests.length === 0) throw new Error(`condition "${text}" has no tests`)
  for (const t of tests) compile(t)  // throws on an unknown name
  return { tests, action, text }
}

/** True when every test in a parsed condition holds. */
export function conditionHolds(cond, env) {
  if (!cond || cond.auto) return false
  return cond.tests.every(t => evaluate(t, env) === true)
}
