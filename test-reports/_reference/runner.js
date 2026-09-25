// In-page queue runner (needs filler.js loaded first). Start it on a /report/<id>
// page so "← New Report" gives a blank form without reloading the page.
//   __queue([plan, plan, …])  → runs each: New Report → sections 1–4 → Generate →
//                               waits for the AI text; stops at the first problem
//   __summary()               → { id: 'done <reportId> <secs>s …' }
window.__next = async n => {
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  ;[...document.querySelectorAll('button')].find(b => b.textContent.includes('Continue →')).click()
  for (let i = 0; i < 60 && ![...document.querySelectorAll('label')].some(l => l.textContent.trim().startsWith(`Q${n}.`)); i++) await sleep(100)
  window.scrollTo(0, 0); await sleep(300)
  return __fill(__plan, n)
}
window.__run = plan => {
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const st = window.__state = { id: plan.id, phase: 'starting', misses: [], t0: Date.now() }
  window.__plan = plan
  ;(async () => {
    try {
      const nr = [...document.querySelectorAll('button')].find(b => b.textContent.includes('New Report'))
      if (!nr) throw new Error('start from a report page (no "New Report" button)')
      nr.click()
      for (let i = 0; i < 100 && !(location.pathname === '/questionnaire' && [...document.querySelectorAll('label')].some(l => l.textContent.trim().startsWith('Q1.0'))); i++) await sleep(100)
      await sleep(800)
      if (Object.keys(JSON.parse(localStorage.getItem('estatesAI_v4_answers') || '{}').answers || {}).length) throw new Error('form was not blank')
      st.phase = 'section 1'; st.misses.push(...(await __fill(plan, 1)).misses.map(m => 'S1 ' + m))
      for (const n of [2, 3, 4]) { st.phase = 'section ' + n; st.misses.push(...(await __next(n)).misses.map(m => `S${n} ` + m)) }
      st.stored = JSON.parse(localStorage.getItem('estatesAI_v4_answers') || '{}').answers
      st.footer = document.body.innerText.match(/(All set[^\n]*|\d+ answers? still needed[^\n]*)/)?.[0]
      if (st.misses.length || !/generate/.test(st.footer || '')) { st.phase = 'needs attention'; return }
      st.phase = 'generating'
      ;[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Generate Report').click()
      for (let i = 0; i < 300 && !/\/report\/[0-9a-f]+/.test(location.pathname); i++) await sleep(200)
      st.reportId = location.pathname.split('/').pop()
      for (let i = 0; i < 72; i++) { const s = await fetch(`/api/reports/${st.reportId}/status`).then(r => r.json()).catch(() => ({})); st.status = s.status; if (s.status === 'complete') break; await sleep(5000) }
      st.phase = st.status === 'complete' ? 'done' : 'report not complete'
      st.seconds = Math.round((Date.now() - st.t0) / 1000)
    } catch (e) { st.phase = 'error'; st.error = String(e) }
  })()
  return 'started ' + plan.id
}
window.__results = window.__results || {}
window.__queue = plans => {
  window.__q = plans.slice()
  ;(async () => {
    const wait = async () => { while (!/done|attention|error|not complete/.test(__state.phase)) await new Promise(r => setTimeout(r, 1000)) }
    while (__q.length) {
      const p = __q.shift()
      __run(p); await wait()
      __results[p.id] = (({ stored, ...r }) => r)(__state)
      if (__state.phase !== 'done') break
      await new Promise(r => setTimeout(r, 1500))
    }
  })()
  return 'queued ' + plans.length
}
window.__summary = () => Object.fromEntries(Object.entries(__results).map(([k, v]) => [k, `${v.phase} ${v.reportId || ''} ${v.seconds || ''}s ${v.misses.join('; ')} ${v.error || ''}`.trim()]))
