'use client'

import { useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'
import { stages, nextStep } from '@/lib/office/dashboard.mjs'
import styles from './office.module.css'

const money = nano => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(nano / 1e9)
const duration = ms => ms < 60000 ? Math.round(ms / 1000) + ' sec' : Math.round(ms / 60000) + ' min'

export function Organisation({ visit }) {
  function person(id) {
    return <button type="button" onClick={() => visit(id)}><strong>{roles[id].name}</strong><small>{roles[id].title}</small></button>
  }
  return <section className={styles.panel}>
    <h2>Organisation chart</h2>
    <div className={styles.org}>
      <strong>Nabil · Owner</strong>
      <div className={styles.branches}><div>{person('omar')}<div className={styles.reports}>{['sarah','daniel','ahmed'].map(id => <div key={id}>{person(id)}</div>)}</div></div>
      <div>{person('emma')}<small>Independent review · Reports directly to you</small></div></div>
    </div>
    <details><summary>Responsibilities and goals</summary>{Object.values(roles).map(member =>
      <article key={member.name}><strong>{member.name} · {member.title}</strong><p>{member.responsibilities}</p><p>{member.goals.join('. ')}.</p></article>)}</details>
    <details open><summary>Responsibility matrix (RACI)</summary>
      <div className={styles.scrollTable}><table><caption>Who does the work and who owns each decision</caption><thead><tr>{['Stage','Responsible','Accountable','Consulted','Informed'].map(s=><th key={s}>{s}</th>)}</tr></thead>
      <tbody>{stages.map(s=><tr key={s.label}><th scope="row">{s.label}</th><td>{s.responsible}</td><td>{s.accountable}</td><td>{s.consulted}</td><td>{s.informed}</td></tr>)}</tbody></table></div></details>
  </section>
}

export function WorkSummary({ tasks, open }) {
  const pending = tasks.filter(t=>t.status !== 'completed')
  return <aside className={styles.workSummary}><h2>Office today</h2>
    <dl>{[['In progress',pending.filter(t=>!t.pause && !['blocked','quality_blocked','awaiting_owner_review'].includes(t.status)).length],
      ['Needs attention',pending.filter(t=>t.pause || ['blocked','quality_blocked'].includes(t.status)).length],
      ['For your approval',pending.filter(t=>t.status === 'awaiting_owner_review').length],
      ['Completed',tasks.length-pending.length]].map(([name,n])=><div key={name}><dt>{name}</dt><dd>{n}</dd></div>)}</dl>
    {pending.slice(0,3).map(t=><button type="button" key={t.id} onClick={()=>open(t)}><strong>{t.brief}</strong><small>{nextStep(t)}</small></button>)}
  </aside>
}

export function Usage({ state, act, busy, open }) {
  const [limit,setLimit] = useState('')
  const usage = state?.usage
  if (!usage) return <p>{state ? 'Usage is temporarily unavailable. Reopen the office to refresh it.' : 'Loading usage…'}</p>
  const m = usage.metrics
  const budget = state.monthlyBudgetCents || 0
  return <section className={styles.panel}><h2>Office usage · {usage.month}</h2>
    <p><strong>{money(m.spent || 0)}</strong> estimated recorded spend{budget ? ' of a US$' + (budget/100).toFixed(2) + ' monthly budget' : ' · Daily allowance active'}</p>
    <p>Anthropic bills Projento for the AI replies. This office has used {usage.callsToday} calls today{budget ? '.' : ' out of 12.'} Quick briefing reads saved work for free.</p>
    {Number(m.held)>0 && <p>{money(m.held)} reserved for pending or unconfirmed usage.</p>}
    <div className={styles.scrollTable}><table><caption>Recorded this month, from the start of tracking</caption><thead><tr>{['Teammate','Tasks led¹','Calls','Tokens','Processing time','Est. cost'].map(s=><th key={s}>{s}</th>)}</tr></thead>
    <tbody>{Object.entries(roles).map(([id,person])=>{const key='role.'+id+':';return <tr key={id}><th scope="row">{person.name}</th><td>{state.assignments.filter(t=>t.delegation?.specialist===id).length}</td><td>{m[key+'calls']||0}</td><td>{Number(m[key+'tokens']||0).toLocaleString('en-GB')}</td><td>{duration(m[key+'ms']||0)}</td><td>{money(m[key+'cost']||0)}</td></tr>})}</tbody></table></div>
    <small>¹ Tasks led covers all saved assignments. Processing time measures time waiting for AI replies. Tokens are the units Anthropic uses to bill for text. Earlier usage has no cost or time record.</small>
    {Number(m['office:unknown'])>0 && <p>{m['office:unknown']} calls have unconfirmed costs.</p>}
    {state.assignments.some(t => m['task.' + t.id + ':calls']) && <details><summary>Usage by assignment</summary>
      {state.assignments.filter(t => m['task.' + t.id + ':calls']).map(t => {
        const key = 'task.' + t.id + ':'
        return <p key={t.id}><button type="button" onClick={() => open(t)}>{t.brief}</button> · {duration(m[key+'ms'])} · {m[key+'tokens']} tokens · {money(m[key+'cost'])}</p>
      })}</details>}
    <details><summary>Manage monthly budget</summary><p>Set a recurring office budget in US dollars to replace the daily limit. The final 20% is reserved for conversations. Enter zero to restore the daily limit.</p>
      <form onSubmit={e=>{e.preventDefault();act('budget',{ monthlyBudgetCents: Math.round(Number(limit)*100) },()=>setLimit(''))}}>
        <label htmlFor="office-budget">Monthly budget (USD)</label><input required id="office-budget" type="number" min="0" max="100000" step="0.01" value={limit} onChange={e=>setLimit(e.target.value)} />
        <button disabled={busy || !limit}>Save budget</button></form></details>
  </section>
}
