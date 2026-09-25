// In-page form filler for https://estates-ai-tool.vercel.app/questionnaire.
// Clicks the same buttons, ticks the same boxes and types into the same fields
// a user would, driven by a plan.json from build-plans.mjs. Defines
// window.__fill(plan, section) → { section, misses, stored }.
window.__fill = async (plan, section) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const waitFor = async (fn, ms = 8000) => { const t = Date.now(); let v; while (!(v = fn()) && Date.now() - t < ms) await sleep(100); return v }
  const misses = []
  const txt = el => el.textContent.replace(/\s+/g, ' ').trim()
  const setValue = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    if (!(el instanceof HTMLSelectElement)) el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const buttons = (root = document) => [...root.querySelectorAll('button')]
  const card = q => [...document.querySelectorAll('label')].find(l => txt(l).startsWith(q + ' '))?.parentElement

  async function answer(step) {
    const { q, value } = step
    let c = card(q)
    if (!c && /^Q[56]/.test(q)) {           // behind the collapsed disclosures at the end of step 4
      for (const b of buttons().filter(b => b.getAttribute('aria-expanded') === 'false' && !b.closest('[data-qkey]'))) { b.click(); await sleep(150) }
      c = card(q)
    }
    if (!c) return misses.push(`${q}: question not on the page`)
    if (Array.isArray(value)) {
      const opts = [...c.querySelectorAll('[role=checkbox]')]
      for (const b of opts) if (b.getAttribute('aria-checked') === 'true' && !value.includes(txt(b))) { b.click(); await sleep(80) }
      for (const v of value) {
        const b = [...c.querySelectorAll('[role=checkbox]')].find(x => txt(x) === v)
        if (!b) misses.push(`${q}: no option "${v}"`)
        else if (b.getAttribute('aria-checked') !== 'true') { b.click(); await sleep(80) }
      }
      return
    }
    if (q === 'Q4.1') {
      const want = value === 'No specific deadline' ? 'No specific deadline' : 'Specific target date'
      buttons(c).find(b => txt(b) === want)?.click(); await sleep(150)
      if (want !== value) { const d = await waitFor(() => c.querySelector('input[type=date]')); d ? setValue(d, value) : misses.push('Q4.1: no date field') }
      return
    }
    const sel = [...c.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === value || txt(o) === value))
    if (sel) {
      const o = [...sel.options].find(o => o.value === value || txt(o) === value)
      setValue(sel, o.value); await sleep(200)
      if (step.other) { const t = await waitFor(() => card(q)?.querySelector('input[type=text]')); t ? setValue(t, step.other) : misses.push(`${q}: no describe box`) }
      return
    }
    const radio = [...c.querySelectorAll('[role=radio]')].find(b => txt(b) === value)
    if (radio) { radio.click(); return }
    const native = [...c.querySelectorAll('input[type=radio]')].find(i => i.value === value)
    if (native) { native.click(); return }
    const field = c.querySelector('textarea, input[type=text], input[type=number], input[type=date]')
    if (field) { setValue(field, String(value)); return }
    misses.push(`${q}: no control for "${value}"`)
  }

  async function fillScope(s) {
    const box = await waitFor(() => document.querySelector('[data-qkey="q2_2_scopeItems"]'))
    if (!box) return misses.push('Q2.3: scope picker not found')
    if (s.typical) {
      const b = await waitFor(() => buttons(box).find(b => /typical scope$/.test(txt(b)) && !b.disabled))
      b ? (b.click(), await sleep(400)) : misses.push('Q2.3: "Use typical scope" not available')
    }
    for (const b of buttons(box).filter(b => txt(b).startsWith('Show items'))) { b.click(); await sleep(60) }
    await sleep(200)
    for (const b of buttons(box).filter(b => txt(b).startsWith('More items'))) { b.click(); await sleep(60) }
    await sleep(200)
    const tick = async (id, on) => {
      const cb = document.getElementById(`scope-${id}`)
      if (!cb) return misses.push(`Q2.3: ${id} not on the page`)
      if (cb.disabled) return misses.push(`Q2.3: ${id} is greyed out`)
      if (cb.checked !== on) { cb.click(); await sleep(120) }
    }
    for (const id of s.add) await tick(id, true)
    for (const id of s.remove) await tick(id, false)
    const openRefine = async id => {
      const b = document.querySelector(`[aria-controls="refine-${id}"]`)
      if (b && b.getAttribute('aria-expanded') !== 'true') { b.click(); await sleep(200) }
      return document.getElementById(`refine-${id}`)
    }
    const tickSeveral = async (o) => {
      const panel = await openRefine(o.id)
      const row = panel && [...panel.querySelectorAll('label')].find(l => txt(l) === o.label)
      const cb = row?.querySelector('input[type=checkbox]')
      if (!cb) return misses.push(`Q2.3: ${o.key} "${o.label}" not in the panel`)
      if (!cb.checked) { cb.click(); await sleep(150) }
    }
    for (const o of s.options) {
      if (o.pick === 'Several') { await tickSeveral(o); continue }
      for (const d of o.dims) {
        const sel = document.querySelector(`select[aria-label="${o.name} — ${d.dim}"]`)
        sel ? (setValue(sel, d.value), await sleep(150)) : misses.push(`Q2.3: no drop-down "${o.name} — ${d.dim}"`)
      }
    }
    for (const qn of s.quantities) {
      if (qn.pick === 'Several') await tickSeveral(qn)
      const panel = await openRefine(qn.id)
      const inp = panel?.querySelector(`input[aria-label="${qn.pick === 'Several' ? `${qn.name} — ${qn.label} quantity` : `${qn.name} quantity`}"]`)
      inp ? (setValue(inp, qn.qty), await sleep(120)) : misses.push(`Q2.3: no quantity box for ${qn.key}`)
    }
    if (s.method) {
      const sel = [...box.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === s.method && /modular/i.test(x.innerHTML)))
      sel ? setValue(sel, s.method) : misses.push('Q2.3: no construction method drop-down')
    }
  }

  const steps = plan.sections[section]
  for (const step of steps) {
    await answer(step); await sleep(150)
    if (section === 2 && (step.q === 'Q2.2' || (step.q === 'Q2.1' && !steps.some(x => x.q === 'Q2.2')))) await fillScope(plan.scope)
  }
  await sleep(300)
  const stored = JSON.parse(localStorage.getItem('estatesAI_v4_answers') || '{}').answers || {}
  return { section, misses, stored }
}
'filler ready'
