'use client'
import { useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'
import { blocked, finished, needsDecision, nextStep, strategyStageNames } from '@/lib/office/dashboard.mjs'
import styles from './office.module.css'

export function GoalHome({state, act, busy, open, navigate}) {
  const [goals,setGoals] = useState('')
  const [evidence,setEvidence] = useState('')
  const tasks = state.assignments
  const active = tasks.filter(t=>t.kind === 'goal' && !finished(t))
  const decisions = tasks.filter(needsDecision)
  const attention = tasks.filter(blocked)
  return <>
    <div className={styles.metrics}>{[
      ['Active goals',active.length,'work'],['In delivery',tasks.filter(t=>t.kind === 'delivery' && !finished(t)).length,'work'],
      ['For approval',decisions.length,'decision'],['Blocked',attention.length,'work'],
    ].map(([label,value,view])=><button key={label} onClick={()=>navigate(view)}><strong>{value}</strong>{label}</button>)}</div>
    <div className={styles.homeGrid}><section className={styles.panel}><h2>Set your business goals</h2>
      <form onSubmit={e=>{e.preventDefault();act('goals',{objectives:goals.split('\n').map(s=>s.trim()).filter(Boolean),evidence},()=>{setGoals('');setEvidence('')})}}>
        <label htmlFor="objectives">What should the team achieve?</label>
        <textarea id="objectives" required maxLength={3600} placeholder="One goal per line, up to three" value={goals} onChange={e=>setGoals(e.target.value)} />
        <details><summary>Add supporting evidence</summary><textarea aria-label="Evidence for the team" value={evidence} maxLength={12000} onChange={e=>setEvidence(e.target.value)} /></details>
        <button disabled={busy || !state.modelReady || !goals.trim()}>Ask Omar for a strategy</button>
      </form></section>
      <section className={styles.panel}><h2>On your desk</h2>
      {![...decisions,...attention].length && <p>No approvals or blockers waiting.</p>}
      {[...decisions,...attention].map(t=><button className={styles.workLink} key={t.id} onClick={()=>open(t)}><strong>{t.brief}</strong><small>{nextStep(t)}</small></button>)}
      </section></div>
    <section className={styles.panel}><h2>Current goals</h2>
    {!active.length && <p>Your goals and Omar’s recommendations will appear here.</p>}
    {active.map(t=><button className={styles.workLink} key={t.id} onClick={()=>open(t)}><strong>{t.brief}</strong><small>{nextStep(t)}</small></button>)}</section>
  </>
}

export function GoalCard({task, tasks, act, busy, ask, open}) {
  const [note,setNote] = useState('')
  const plan = task.proposals.at(-1)
  const children = tasks.filter(t=>t.parentId === task.id)
  const decide = decision => act('goal_decide',{id:task.id,decision,note},()=>setNote(''))
  return <article id={'task-'+task.id} className={styles.panel}>
    <small>{strategyStageNames[task.status]} · Omar</small><h3>{task.brief}</h3>
    {plan && <p>{plan.summary}</p>}
    {children.length > 0 && <p>{children.filter(t=>t.status === 'completed').length} of {children.length} internal deliverables checked and filed.</p>}
    {plan && <details><summary>Strategy and measures · version {plan.version}</summary>
      <p><strong>Assumptions</strong> {plan.assumptions}</p><p><strong>Cost, value and alternatives</strong> {plan.tradeoff}</p>
      {plan.objectives.map((o,i)=><section key={i}><h4>{o.name}</h4><p>Baseline · {o.baseline}</p><p>Target · {o.target}</p>
        <ul>{o.actions.map((a,j)=><li key={j}><strong>{roles[a.lead].name}</strong> · {a.brief}<br/>{a.deadline} · {a.criteria}</li>)}</ul></section>)}</details>}
    {task.strategyReview && <p><strong>Emma · {task.strategyReview.verdict}</strong> {task.strategyReview.reasons}</p>}
    {task.legacyRecord && <details><summary>Earlier assignment record</summary>
      {task.legacyRecord.history.map((e,i)=><p key={i}>{e.action.replaceAll('_',' ')} · {e.content || e.reasons || e.note || e.at}</p>)}</details>}
    {task.evidence && <details><summary>Owner’s evidence</summary><p>{task.evidence}</p></details>}
    <details><summary>Research and decision history</summary>{task.history.map((e,i)=><p key={i}><strong>{roles[e.by]?.name || 'You'}</strong> · {e.action.replaceAll('_',' ')} {e.note || e.reasons}</p>)}</details>
    {children.map(t=><button className={styles.workLink} key={t.id} onClick={()=>open(t)}>{t.brief}<small>{roles[t.delegation.specialist].name} · {nextStep(t)}</small></button>)}
    {task.status === 'strategy_decision' && <><label>Feedback for Omar<textarea value={note} maxLength={1500} onChange={e=>setNote(e.target.value)} /></label>
      <button disabled={busy} onClick={()=>decide('approve')}>Approve internal work</button>
      <button disabled={busy || !note.trim()} onClick={()=>decide('revise')}>Request changes</button>
      <button disabled={busy || !note.trim()} onClick={()=>decide('reject')}>Decline strategy</button></>}
    {task.approved?.permissions?.map((p,i)=><div key={i}><p><strong>Separate permission</strong> · {p}</p>
      {task.clearances?.[i] ? <p>Decision recorded · {task.clearances[i].decision}</p> : ['approve','decline'].map(d=><button key={d} disabled={busy} onClick={()=>act('permission',{id:task.id,index:i,decision:d})}>{d === 'approve' ? 'Authorise this action' : 'Decline this action'}</button>)}
      <small>Recording permission does not perform the external action.</small></div>)}
    {task.status === 'strategy_blocked' && <><label>Evidence or direction<textarea value={note} onChange={e=>setNote(e.target.value)} /></label>
      <button disabled={busy || !note.trim()} onClick={()=>act('strategy_evidence',{id:task.id,note})}>Return to Omar</button></>}
    {task.status === 'suggested' && <button disabled={busy} onClick={()=>act('plan_followup',{id:task.id})}>Ask Omar to plan this</button>}
    {task.pause && <p role="status">{task.pause} <button disabled={busy} onClick={()=>act('retry',{id:task.id})}>Resume planning</button></p>}
    {ask(task)}
    <details><summary>Assign follow-up work</summary><form onSubmit={e=>{e.preventDefault();const f=e.currentTarget;act('followup',{id:task.id,brief:new FormData(f).get('brief')},()=>f.reset())}}>
      <label>Outcome needed<textarea required name="brief" maxLength={1200} /></label><button disabled={busy}>Send follow-up to Omar</button>
    </form></details>
  </article>
}
