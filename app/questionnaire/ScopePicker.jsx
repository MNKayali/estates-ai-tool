'use client'

/**
 * Q2.3 Scope of works — the NRM1 v5.2 picker.
 *
 * Four levels, each a tick box that switches on what sits under it:
 *   Group    "5 Services"             ticking it ticks the group's typical items
 *   Section  "Mechanical"             only where the workbook names a Section
 *   Item     "Heating and hot water"  pre-ticked or not by project type, level
 *                                     of intervention and building use
 *   Refine   "I know this"            real quantities (a partial m² included);
 *                                     left closed, the estimate is used
 *
 * Nothing starts ticked. "Use typical scope" and group/section ticks apply the
 * workbook's defaults; the user refines only what they know. Every rule here
 * — what shows, what is typical, which option a drop-down starts on, what
 * quantity an item carries — is lib/scopeEngine.js over the workbook's
 * catalogue, the same code calculateCost() prices with, so the "≈ 40 nr
 * (estimated)" on screen is the quantity the report prices.
 *
 * Answer keys (unchanged names, so drafts and reports keep loading):
 *   q2_2_scopeItems         ticked Scope IDs (S-0039)
 *   q2_2_scopeOptions       { scopeId: [rate keys] } — only choices the user made
 *   q2_2_quantities         { rate key: quantity } — only figures the user gave
 *   q2_2_extArea            external works area (Group 8 header)
 *   q2_2_constructionMethod 'Traditional' | 'Modular' (Group 2 header)
 */
import { useMemo, useState } from 'react'
import {
  buildContext, resolveSelection, isOffered, isRelevant, isItemAvailable, isOptionAvailable,
  offeredOptions, itemAvailableFrom, lacksRate, typicalItemIds, suggestedItemIds,
  chosenOptionKeys, indexCatalogue,
} from '../../lib/scopeEngine.js'
import { isEnter } from '../../lib/scopeExpr.js'

const fmtNum = n => {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-GB')
}

function qtyText(line) {
  const unit = line.option.unit || ''
  if (unit === 'band') return 'Lump sum for the size chosen'
  if (line.qtySource === 'user') return `${fmtNum(line.qty)} ${unit} (your figure)`
  if (isEnter(line.qty)) return 'Enter a quantity — not priced until you do'
  // e.g. Solar PV from the footprint on an external-works-only project.
  if (!(line.qty > 0)) return 'Estimates to nothing for this project — enter a quantity if you need it'
  return `≈ ${fmtNum(line.qty)} ${unit} (estimated)`
}

const dimName = d => d.dim || 'Option'

// Drop-downs for a pick-one item: one per dimension ("System", "Scope"),
// together choosing the option row. They change the rate, never the quantity.
function OptionSelects({ item, options, chosenKey, ctx, onChoose }) {
  const current = options.find(o => o.key === chosenKey) || options[0]
  const dims = []
  for (const o of options) for (const d of o.dims) if (!dims.includes(dimName(d))) dims.push(dimName(d))
  const valueOf = (o, d) => o.dims.find(x => dimName(x) === d)?.value
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {dims.map(d => {
        const values = [...new Set(options.map(o => valueOf(o, d)).filter(Boolean))]
        const targetFor = v => {
          const same = options.find(o => valueOf(o, d) === v && dims.every(e => e === d || valueOf(o, e) === valueOf(current, e)))
          return same || options.find(o => valueOf(o, d) === v && isOptionAvailable(o, ctx)) || options.find(o => valueOf(o, d) === v)
        }
        return (
          <label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-soft)' }}>
            {d !== 'Option' && <span>{d}:</span>}
            <select value={valueOf(current, d) || ''}
              aria-label={`${item.name} — ${d}`}
              onChange={e => { const t = targetFor(e.target.value); if (t) onChoose(t.key) }}
              style={{ fontFamily: 'var(--font-body)', fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', maxWidth: '100%' }}>
              {values.map(v => {
                const t = targetFor(v)
                const ok = t && isOptionAvailable(t, ctx)
                return <option key={v} value={v} disabled={!ok}>{v}{ok ? '' : ' (needs a higher level)'}</option>
              })}
            </select>
          </label>
        )
      })}
    </span>
  )
}

export default function ScopePicker({ catalogue, answers, setAnswers, suggestBar = null, error = null }) {
  const ctx = useMemo(() => buildContext(catalogue, answers), [catalogue, answers])
  const resolved = useMemo(() => {
    try { return resolveSelection(catalogue, answers) } catch (e) { console.warn('[ScopePicker]', e); return null }
  }, [catalogue, answers])
  const byId = useMemo(() => new Map((resolved?.items || []).map(c => [c.item.id, c])), [resolved])
  const ticked = useMemo(() => new Set(answers.q2_2_scopeItems || []), [answers.q2_2_scopeItems])

  const offered = useMemo(() => catalogue.items.filter(it => isOffered(it, ctx)), [catalogue, ctx])
  const groups = useMemo(() => {
    const out = []
    for (const it of offered) {
      let g = out.find(x => x.num === it.groupNum)
      if (!g) { g = { num: it.groupNum, label: it.groupLabel, items: [] }; out.push(g) }
      g.items.push(it)
    }
    return out.sort((a, b) => a.num - b.num)
  }, [offered])

  const [openGroups, setOpenGroups] = useState(() => new Set(offered.filter(it => ticked.has(it.id)).map(it => it.groupNum)))
  const [openMore, setOpenMore] = useState(() => new Set())
  const [openRefine, setOpenRefine] = useState(() => new Set())
  const [notes, setNotes] = useState({})   // groupNum → hint shown after a group tick

  const levelName = n => catalogue.settings.interventionLevels.find(l => l.level === n)?.name || `level ${n}`
  const useLabel = answers.q1_3_buildingUse || 'this building use'
  const catOrder = useMemo(() => new Map(catalogue.items.map((it, i) => [it.id, i])), [catalogue])
  const { byId: catById } = indexCatalogue(catalogue)

  const toggleSet = (setter, key) => setter(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key)
    else n.add(key)
    return n
  })

  // Ticks items (plus anything a 'When selected' SUGGEST adds), or unticks them
  // and forgets their option choices and quantities.
  function setTicked(ids, on) {
    setAnswers(prev => {
      const cur = new Set(prev.q2_2_scopeItems || [])
      const opts = { ...(prev.q2_2_scopeOptions || {}) }
      const qtys = { ...(prev.q2_2_quantities || {}) }
      if (on) {
        const pctx = buildContext(catalogue, prev)
        for (const id of ids) {
          cur.add(id)
          const it = catById.get(id)
          if (it) for (const s of suggestedItemIds(catalogue, pctx, it, chosenOptionKeys(it, pctx, prev).keys)) cur.add(s)
        }
      } else {
        for (const id of ids) {
          cur.delete(id)
          delete opts[id]
          for (const o of catById.get(id)?.options || []) delete qtys[o.key]
        }
      }
      const list = [...cur].sort((a, b) => (catOrder.get(a) ?? 1e9) - (catOrder.get(b) ?? 1e9))
      return { ...prev, q2_2_scopeItems: list, q2_2_scopeOptions: opts, q2_2_quantities: qtys }
    })
  }

  function applyTypical() {
    const ids = typicalItemIds(catalogue, ctx)
    const withSuggestions = new Set(ids)
    for (const id of ids) {
      const it = catById.get(id)
      for (const s of suggestedItemIds(catalogue, ctx, it, chosenOptionKeys(it, ctx, { ...answers, q2_2_scopeOptions: {} }).keys)) withSuggestions.add(s)
    }
    const list = [...withSuggestions].sort((a, b) => catOrder.get(a) - catOrder.get(b))
    setAnswers(prev => {
      const keep = new Set(list.flatMap(id => catById.get(id).options.map(o => o.key)))
      const qtys = Object.fromEntries(Object.entries(prev.q2_2_quantities || {}).filter(([k]) => keep.has(k)))
      return { ...prev, q2_2_scopeItems: list, q2_2_scopeOptions: {}, q2_2_quantities: qtys }
    })
    setOpenGroups(new Set(list.map(id => catById.get(id).groupNum)))
    setNotes({})
  }

  function clearAll() {
    setAnswers(prev => ({ ...prev, q2_2_scopeItems: [], q2_2_scopeOptions: {}, q2_2_quantities: {} }))
    setNotes({})
  }

  // Ticking a group applies that group's typical items; where the workbook
  // has none for this project, the group opens so the user can choose.
  function toggleGroup(g, on) {
    if (!on) { setTicked(g.items.map(it => it.id), false); return }
    const ids = typicalItemIds(catalogue, ctx, { groupNum: g.num })
    setOpenGroups(prev => new Set(prev).add(g.num))
    if (ids.length) { setTicked(ids, true); setNotes(n => ({ ...n, [g.num]: null })) }
    else setNotes(n => ({ ...n, [g.num]: 'Nothing in this group is typical for this project — tick the items you need.' }))
  }

  function toggleSection(g, section, on) {
    const inSection = g.items.filter(it => it.section === section)
    if (!on) { setTicked(inSection.map(it => it.id), false); return }
    let ids = typicalItemIds(catalogue, ctx, { groupNum: g.num, section })
    if (!ids.length) {
      const avail = inSection.filter(it => isItemAvailable(it, ctx) && !lacksRate(it, ctx))
      const relevant = avail.filter(it => isRelevant(it, ctx))
      ids = (relevant.length ? relevant : avail).map(it => it.id)
    }
    setTicked(ids, true)
  }

  const setOptions = (id, keys) => setAnswers(prev => ({ ...prev, q2_2_scopeOptions: { ...(prev.q2_2_scopeOptions || {}), [id]: keys } }))
  const setQty = (key, value) => setAnswers(prev => {
    const q = { ...(prev.q2_2_quantities || {}) }
    if (value === '' || value === null || value === undefined) delete q[key]
    else q[key] = value
    return { ...prev, q2_2_quantities: q }
  })
  const resetToEstimate = item => setAnswers(prev => {
    const q = { ...(prev.q2_2_quantities || {}) }
    for (const o of item.options) delete q[o.key]
    return { ...prev, q2_2_quantities: q }
  })

  const needQty = (resolved?.items || []).filter(c => c.lines.some(l => isEnter(l.qty))).map(c => c.item.name)
  const typicalCount = typicalItemIds(catalogue, ctx).length

  // ─── Rendering ────────────────────────────────────────────────────────────

  const S = {
    groupRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--tint-2)', border: '1px solid var(--border)', borderRadius: 9, flexWrap: 'wrap' },
    groupLabel: { fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.4px' },
    pill: { fontFamily: 'var(--font-body)', background: 'rgba(26,46,74,.06)', color: 'var(--navy)', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 },
    sectionRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px 4px', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.5px' },
    itemRow: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' },
    itemHead: { display: 'flex', alignItems: 'flex-start', gap: 9, flexWrap: 'wrap' },
    check: { width: 17, height: 17, marginTop: 2, accentColor: 'var(--navy)', flexShrink: 0, cursor: 'pointer' },
    name: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.35 },
    sub: { fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.45 },
    req: { fontSize: 11.5, color: 'var(--amber-deep)', fontWeight: 600 },
    linkBtn: { background: 'none', border: 'none', padding: 0, color: 'var(--navy)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' },
    refine: { background: 'var(--tint)', borderLeft: '3px solid var(--navy)', padding: '10px 12px', borderRadius: '0 8px 8px 0', display: 'flex', flexDirection: 'column', gap: 8 },
    input: { fontSize: 14, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 7, color: 'var(--ink)', background: 'var(--surface)', width: 120 },
    headCtl: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-soft)', fontFamily: 'var(--font-body)' },
  }

  function renderRefine(item, c) {
    const offeredOpts = offeredOptions(item, ctx)
    if (item.pick === 'Several') {
      const chosen = new Set(c.optionKeys)
      return (
        <div id={`refine-${item.id}`} style={S.refine}>
          <span style={S.sub}>Tick each type you need and give its quantity. Leave a quantity blank to use the estimate.</span>
          {offeredOpts.map(o => {
            const on = chosen.has(o.key)
            const avail = isOptionAvailable(o, ctx)
            const line = c.lines.find(l => l.optionKey === o.key)
            return (
              <div key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 180, opacity: avail ? 1 : 0.5 }}>
                  <input type="checkbox" style={S.check} checked={on} disabled={!avail || (on && chosen.size === 1)}
                    onChange={() => setOptions(item.id, on ? c.optionKeys.filter(k => k !== o.key) : [...c.optionKeys, o.key])} />
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{o.label}</span>
                </label>
                {on && (
                  <label style={S.headCtl}>
                    <input type="number" min={0} style={S.input}
                      aria-label={`${item.name} — ${o.label} quantity`}
                      value={(answers.q2_2_quantities || {})[o.key] ?? ''}
                      placeholder={line && !isEnter(line.estimate) ? fmtNum(line.estimate) : 'Enter'}
                      onChange={e => setQty(o.key, e.target.value)} />
                    <span>{o.unit}</span>
                  </label>
                )}
              </div>
            )
          })}
          <div><button type="button" style={S.linkBtn} onClick={() => resetToEstimate(item)}>Use estimates</button></div>
        </div>
      )
    }
    const line = c.lines[0]
    return (
      <div id={`refine-${item.id}`} style={S.refine}>
        <label style={S.headCtl}>
          <span>Quantity{line.option.unit ? ` (${line.option.unit})` : ''}:</span>
          <input type="number" min={0} style={S.input}
            aria-label={`${item.name} quantity`}
            value={(answers.q2_2_quantities || {})[line.optionKey] ?? ''}
            placeholder={!isEnter(line.estimate) ? fmtNum(line.estimate) : 'Enter'}
            onChange={e => setQty(line.optionKey, e.target.value)} />
        </label>
        <span style={S.sub}>{/m²/.test(line.option.unit || '') ? 'Enter the area actually being worked on — a part of the building is fine.' : 'Enter the real number if you know it.'}</span>
        <div><button type="button" style={S.linkBtn} onClick={() => resetToEstimate(item)}>Use estimate</button></div>
      </div>
    )
  }

  function renderItem(item) {
    const available = isItemAvailable(item, ctx)
    const on = ticked.has(item.id) && available
    const c = byId.get(item.id)
    const offeredOpts = offeredOptions(item, ctx)
    const hasUser = c?.lines.some(l => l.qtySource === 'user')
    const refineOpen = openRefine.has(item.id)
    const isBand = (c?.lines[0]?.option.unit || item.unit) === 'band'
    return (
      <li key={item.id} style={{ ...S.itemRow, ...(on ? { border: '1.5px solid var(--navy)', background: 'rgba(26,46,74,.035)' } : {}), ...(available ? {} : { opacity: 0.55 }) }}>
        <div style={S.itemHead}>
          <input type="checkbox" id={`scope-${item.id}`} style={S.check} checked={on} disabled={!available}
            onChange={() => setTicked([item.id], !on)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            <label htmlFor={`scope-${item.id}`} style={{ ...S.name, cursor: available ? 'pointer' : 'not-allowed' }}>{item.name}</label>
            {item.included && !on && <span style={S.sub}>{item.included}</span>}
            {!available && <span style={S.req}>Requires: {levelName(itemAvailableFrom(item, ctx))}</span>}
            {on && lacksRate(item, ctx) && <span style={S.req}>No rate in the workbook for this project type yet — it will be listed as unpriced.</span>}
            {on && c && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center' }}>
                {item.pick === 'One' && offeredOpts.length > 1 && (
                  <OptionSelects item={item} options={offeredOpts} chosenKey={c.optionKeys[0]} ctx={ctx}
                    onChoose={k => setOptions(item.id, [k])} />
                )}
                {item.pick === 'Several'
                  ? <span style={S.sub}>{c.lines.map(l => `${l.option.label}: ${qtyText(l)}`).join(' · ')}</span>
                  : <span style={S.sub}>{qtyText(c.lines[0])}</span>}
                {c.bumpedBy && <span style={S.sub}>(one size up — {c.bumpedBy.join(', ')})</span>}
                {!isBand || item.pick === 'Several' ? (
                  <button type="button" style={S.linkBtn} aria-expanded={refineOpen} aria-controls={`refine-${item.id}`}
                    onClick={() => toggleSet(setOpenRefine, item.id)}>
                    {refineOpen ? 'Close' : hasUser ? 'Edit my figures' : 'I know this'}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
        {on && c && refineOpen && renderRefine(item, c)}
      </li>
    )
  }

  function renderItems(items) {
    const sections = []
    for (const it of items) {
      let s = sections.find(x => x.name === it.section)
      if (!s) { s = { name: it.section, items: [] }; sections.push(s) }
      s.items.push(it)
    }
    return sections
  }

  function renderSection(g, sec) {
    const list = <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>{sec.items.map(renderItem)}</ul>
    if (!sec.name) return <div key="__none">{list}</div>
    const all = g.items.filter(it => it.section === sec.name)
    const count = all.filter(it => ticked.has(it.id)).length
    const anyAvail = all.some(it => isItemAvailable(it, ctx))
    const id = `sec-${g.num}-${sec.name.replace(/\W+/g, '-')}`
    return (
      <div key={sec.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={S.sectionRow}>
          <input type="checkbox" id={id} style={S.check} checked={count > 0} disabled={!anyAvail}
            onChange={() => toggleSection(g, sec.name, count === 0)} />
          <label htmlFor={id} style={{ cursor: 'pointer' }}>{sec.name}</label>
          {count > 0 && <span style={S.pill}>{count}</span>}
        </div>
        {list}
      </div>
    )
  }

  function groupHeaderControl(g) {
    if (g.num === 2 && catalogue.settings.hasModularFactor) {
      return (
        <label style={S.headCtl} onClick={e => e.stopPropagation()}>
          <span>Construction method:</span>
          <select value={answers.q2_2_constructionMethod || 'Traditional'}
            onChange={e => setAnswers(prev => ({ ...prev, q2_2_constructionMethod: e.target.value }))}
            style={{ fontFamily: 'var(--font-body)', fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}>
            <option>Traditional</option>
            <option>Modular</option>
          </select>
        </label>
      )
    }
    if (g.num === 8) {
      const est = resolved?.inputs?.EXT_AREA
      if (ctx.PT === 'EW') {
        return <span style={S.headCtl}>External works area: <strong style={{ color: 'var(--ink)' }}>{fmtNum(answers.q1_5_size) || '—'} m²</strong> (your answer to Q1.5)</span>
      }
      return (
        <label style={S.headCtl}>
          <span>External works area (m²):</span>
          <input type="number" min={0} style={{ ...S.input, width: 110 }}
            aria-label="External works area in square metres"
            value={answers.q2_2_extArea ?? ''}
            placeholder={est ? `≈ ${fmtNum(est)}` : 'Enter'}
            onChange={e => setAnswers(prev => ({ ...prev, q2_2_extArea: e.target.value }))} />
          {!answers.q2_2_extArea && est ? <span>estimated from the footprint</span> : null}
        </label>
      )
    }
    return null
  }

  if (!ctx.PT) return <p style={{ color: 'var(--text-soft)', fontSize: 13, padding: '8px 0' }}>Select a project type (Q1.2) above to see the scope items for it.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--tint)' }}>
        <button type="button" onClick={applyTypical} disabled={typicalCount === 0 || (ctx.usesLevel && !ctx.LEVEL)}
          style={{ padding: '9px 16px', borderRadius: 8, cursor: typicalCount && !(ctx.usesLevel && !ctx.LEVEL) ? 'pointer' : 'not-allowed', opacity: typicalCount && !(ctx.usesLevel && !ctx.LEVEL) ? 1 : 0.55, border: '1.5px solid var(--navy)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13.5 }}>
          {ticked.size > 0 ? 'Reset to typical scope' : 'Use typical scope'}
        </button>
        <span style={{ color: 'var(--text-soft)', fontSize: 13, flex: 1, minWidth: 180 }}>
          {ctx.usesLevel && !ctx.LEVEL
            ? 'Choose the level of intervention (Q2.2) first — it decides what a typical scope includes.'
            : typicalCount === 0
              ? 'There is no typical scope for this project type — tick the groups and items you need.'
              : ticked.size > 0
                ? `${ticked.size} item${ticked.size === 1 ? '' : 's'} ticked. Everything is priced on an estimate until you give a real figure in "I know this".`
                : 'Ticks what this type of project usually includes, priced on estimates. You then change only what you know.'}
        </span>
        {ticked.size > 0 && (
          <button type="button" onClick={clearAll}
            style={{ padding: '9px 14px', borderRadius: 8, cursor: 'pointer', border: '1.5px solid var(--border-2)', background: 'transparent', color: 'var(--text-soft)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5 }}>
            Clear all
          </button>
        )}
      </div>

      {suggestBar}

      {groups.map(g => {
        const count = g.items.filter(it => ticked.has(it.id)).length
        const open = openGroups.has(g.num)
        const main = g.items.filter(it => isRelevant(it, ctx))
        const more = g.items.filter(it => !isRelevant(it, ctx))
        const moreTicked = more.filter(it => ticked.has(it.id)).length
        const moreOpen = openMore.has(g.num) || moreTicked > 0
        const anyAvail = g.items.some(it => isItemAvailable(it, ctx))
        const gid = `grp-${g.num}`
        return (
          <section key={g.num} aria-labelledby={`${gid}-label`}>
            <div style={S.groupRow}>
              <input type="checkbox" id={gid} style={S.check} checked={count > 0} disabled={!anyAvail}
                onChange={() => toggleGroup(g, count === 0)} />
              <label htmlFor={gid} id={`${gid}-label`} style={{ ...S.groupLabel, cursor: 'pointer' }}>{g.num} {g.label}</label>
              {count > 0 && <span style={S.pill}>{count} ticked</span>}
              {!anyAvail && <span style={S.req}>Not included at this level of intervention</span>}
              <span style={{ flex: 1 }} />
              {open && groupHeaderControl(g)}
              <button type="button" aria-expanded={open} aria-controls={`${gid}-body`}
                onClick={() => toggleSet(setOpenGroups, g.num)}
                style={{ ...S.linkBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {open ? 'Hide' : 'Show'} items
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .18s ease' }} aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            </div>
            {open && (
              <div id={`${gid}-body`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 4px 8px' }}>
                {notes[g.num] && <p role="status" style={{ ...S.sub, margin: 0 }}>{notes[g.num]}</p>}
                {renderItems(main).map(sec => renderSection(g, sec))}
                {more.length > 0 && (
                  <div>
                    <button type="button" aria-expanded={moreOpen} onClick={() => toggleSet(setOpenMore, g.num)} style={S.linkBtn}>
                      {moreOpen ? 'Hide' : 'More items'} — not usually needed for {useLabel} ({more.length})
                    </button>
                    {moreOpen && (
                      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {more.map(renderItem)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}

      {needQty.length > 0 && (
        <p role="status" style={{ margin: 0, padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--amber)', backgroundColor: 'rgba(196,134,26,.07)', color: 'var(--ink)' }}>
          {needQty.join(', ')} {needQty.length === 1 ? 'has' : 'have'} no reliable estimate and won&apos;t be priced until you enter a quantity in &ldquo;I know this&rdquo;.
        </p>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
    </div>
  )
}
