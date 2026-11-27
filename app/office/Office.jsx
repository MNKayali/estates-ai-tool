'use client'

import { useEffect, useRef, useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'
import { eventLabel, eventText } from '@/lib/office/task-conversation.mjs'
import VoiceControls from './VoiceControls'
import Meetings from './Meetings'
import { Organisation, Usage, WorkSummary } from './OfficeOverview'
import { GoalHome, GoalCard } from './GoalBoard'
import { nextStep, needsDecision, finished, blocked } from '@/lib/office/dashboard.mjs'
import styles from './office.module.css'

const labels = {
  queued: 'With Omar', assigned: 'Assigned', in_progress: 'In progress',
  with_gm: 'With Omar for recommendation', blocked: 'Blocked', quality_blocked: 'Blocked by Emma', revision_requested: 'Revision requested',
  awaiting_quality_review: 'With Emma', awaiting_owner_review: 'Your decision', completed: 'Completed',
}

async function loadOffice(signal = AbortSignal.timeout(8000)) {
  const response = await fetch('/api/office', { cache: 'no-store', signal })
  if (response.status === 403) throw new Error('Your office sign-in has expired. Reload the page to sign in again.')
  if (!response.ok) throw new Error('Could not load the office. Try Reload office.')
  return response.json()
}

function SavedRecords({ task, source }) {
  if (!task || !source?.events.length) return null
  return <details>
    <summary>See the records Omar used</summary>
    {source.events.map(index => {
      const event = task.history[index]
      return event && <details key={index}>
        <summary>{eventLabel(event)} · {roles[event.by]?.name || 'You'}</summary>
        <p className={styles.content}>{eventText(event)}</p>
      </details>
    })}
  </details>
}

export default function Office() {
  const [state, setState] = useState(null)
  const [view, setView] = useState('home')
  const [role, setRole] = useState('omar')
  const [selectedTask, setSelectedTask] = useState('')
  const [pending, setPending] = useState(null)
  const thread = useRef(null)
  const [busy, setBusy] = useState(false)
  const [workingRole, setWorkingRole] = useState(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})
  const actionInFlight = useRef(false)
  const message = drafts[role] ?? ''
  function setMessage(value) {
    setDrafts(previous => ({ ...previous, [role]: value }))
  }
  const [strategy, setStrategy] = useState('')

  function displayOffice(data) {
    setState(previous => previous && previous.revision > data.revision ? previous : data)
    setStrategy(draft => draft || data.strategy)
    setError('')
  }

  function showLoadError(failure) {
    if (failure.name !== 'AbortError') setError(failure.message || 'Could not load the office.')
  }

  function refresh() {
    void loadOffice().then(displayOffice, showLoadError)
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadOffice(AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])).then(displayOffice, showLoadError)
    return () => controller.abort()
  }, [])

  const managing = state?.assignments.some(task => task.kind && !task.pause && ['scoping','consulting','proposing','checking_strategy','queued','assigned','in_progress','revision_requested','awaiting_quality_review','with_gm'].includes(task.status)) || state?.meetings?.some(m=>m.status === 'running' && !m.pause)
  useEffect(() => {
    if (!managing || !state?.modelReady) return
    const controller = new AbortController()
    const sync = async () => {
      try {
        const response = await fetch('/api/office', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume', revision: 0 }), signal: controller.signal,
        })
        if (response.ok && !controller.signal.aborted) {
          const data = await response.json()
          setState(old => old && old.revision > data.revision ? old : data)
        }
      } catch { /* A later poll resumes from the last saved handover. */ }
    }
    void sync()
    const timer = setInterval(sync, 8000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [managing, state?.modelReady])

  async function act(action, fields, onSuccess) {
    if (!state || actionInFlight.current) return
    actionInFlight.current = true
    setError('')
    setBusy(true)
    setWorkingRole(fields.role ?? null)
    if (action === 'chat') setPending({ role: fields.role, words: fields.message })
    try {
      const response = await fetch('/api/office', {
        method: 'POST',
        signal: AbortSignal.timeout(43000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: state.revision, ...fields }),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 403) throw new Error('Your office sign-in has expired. Reload the page to sign in again.')
      if (!response.ok || !data) {
        if (response.status === 409) {
          const latest = await loadOffice().catch(() => null)
          if (latest) setState(latest)
        }
        throw new Error(data?.error || 'The office did not return a reply. Check the conversation before trying again.')
      }
      setState(previous => previous && previous.revision > data.revision ? previous : data)
      onSuccess?.(data)
    } catch (failure) {
      setError(failure.name === 'TimeoutError' || failure.name === 'AbortError'
        ? 'The office did not answer in time. Your draft is still here. Refresh to check whether a reply was saved before trying again.'
        : failure.message || 'Could not complete the action.')
    } finally {
      actionInFlight.current = false
      setBusy(false)
      setWorkingRole(null)
      setPending(null)
    }
  }

  const teamMember = roles[role]
  const assignments = state?.assignments ?? []
  const chat = state?.chats[role] ?? []
  const latest = chat.at(-1)
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
  }, [role, latest, pending, view])
  useEffect(() => {
    if (selectedTask) document.getElementById('task-' + selectedTask)?.scrollIntoView({ block: 'center' })
  }, [selectedTask, view])
  function openTask(task) {
    setSelectedTask(task.id)
    setView(needsDecision(task) ? 'decision' : 'work')
  }
  function visit(id) {
    setRole(id)
    setView('brief')
    requestAnimationFrame(() => document.getElementById('office-message')?.focus())
  }
  function askOmar(task, question = 'What changed, why, and what do you need me to decide?') {
    visit('omar')
    void act('chat', { role: 'omar', message: question, assignmentId: task.id })
  }
  function askButton(task) {
    return <button type="button" disabled={busy || !state?.modelReady} onClick={() => askOmar(task)}>Ask Omar about this</button>
  }
  function sendMessage(words) {
    if (!words.trim()) return
    void act('chat', { role, message: words }, () => {
      setDrafts(previous => previous[role] === words ? { ...previous, [role]: '' } : previous)
    })
  }
  const counts = {
    open: assignments.filter(t=>!finished(t)).length,
    blocked: assignments.filter(blocked).length,
    decision: assignments.filter(needsDecision).length,
  }

  return (
    <>
    <main className={styles.office}>
      <header className={styles.header}>
        <div><span className={styles.brand}>PROJENTO</span><h1>Your AI office</h1></div>
        <nav aria-label="Office">
          <button type="button" aria-pressed={view === 'home'} onClick={()=>setView('home')}>Overview</button>
          <button type="button" aria-pressed={view === 'brief'} onClick={() => { setRole('omar'); setView('brief') }}>Brief Omar</button>
          <button type="button" aria-pressed={view === 'work'} onClick={() => setView('work')}>Work board</button>
          <button type="button" aria-pressed={view === 'decision'} onClick={() => setView('decision')}>For your approval ({counts.decision})</button>
          <button type="button" aria-pressed={view === 'meetings'} onClick={()=>setView('meetings')}>Meetings</button>
          <button type="button" aria-pressed={view === 'team'} onClick={() => setView('team')}>Organisation</button>
          <button type="button" aria-pressed={view === 'usage'} onClick={() => setView('usage')}>Usage</button>
          <button type="button" disabled={busy} onClick={async () => {
            try {
              const response = await fetch('/api/logout', { method: 'POST' })
              if (!response.ok) throw new Error('Could not sign out. Please try again.')
              window.location.reload()
            } catch (failure) { setError(failure.message) }
          }}>Sign out</button>
        </nav>
      </header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!state && error && <button type="button" onClick={refresh}>Reload office</button>}
      {!state && !error && <p role="status">Opening your office…</p>}
      {state && !state.modelReady && <p role="status">Agent conversations and execution need an office model to be configured.</p>}
      {view === 'home' && state && <GoalHome state={state} act={act} busy={busy} open={openTask} navigate={setView} />}
      {view === 'brief' && <>
        <div className={styles.homeGrid}>
        <section className={styles.panel} aria-labelledby="chat-heading">
          <div className={styles.contactHeader}>
            <span className={styles.face} data-person={role} aria-hidden="true" />
            <div><h2 id="chat-heading" tabIndex={-1}>{role === 'omar' ? 'Brief Omar' : 'Talk to ' + teamMember.name}</h2>
          <p>{teamMember.title} · {role === 'omar' || role === 'emma' ? 'Reports to you' : 'Reports to Omar'}</p></div>
          </div>
          <div className={styles.contactList} aria-label="Select teammate">
            {Object.entries(roles).map(([id,member])=><button type="button" key={id} aria-pressed={id===role} onClick={()=>visit(id)}>{member.name}</button>)}
          </div>
          <div className={styles.thread} ref={thread} aria-label={'Conversation with ' + teamMember.name} role="log">
            {!chat.length && !pending && <p>What would you like {teamMember.name} to help you with?</p>}
            {chat.map((turn, i) => <div key={i} className={styles.exchange}>
              <p className={styles.ownerMessage}><strong>You</strong>{turn.message}</p>
              <div className={styles.agentMessage}><strong>{teamMember.name}</strong>
              <p>{turn.content.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
              {turn.choices?.map(id => {
                const task = assignments.find(item => item.id === id)
                return task && <button type="button" key={id} disabled={busy || !state?.modelReady} onClick={() => askOmar(task, turn.message)}>{task.brief}</button>
              })}
              <SavedRecords task={assignments.find(task => task.id === turn.recordSource?.id)} source={turn.recordSource} />
              {[...new Set([turn.assignmentId, ...(turn.relatedAssignments ?? [])])].map(id => {
                const task = assignments.find(item => item.id === id)
                return task && <button type="button" key={id} onClick={() => openTask(task)}>{task.brief}</button>
              })}</div></div>)}
            {pending?.role === role && <p className={styles.ownerMessage}><strong>You</strong>{pending.words}<small>{teamMember.name} is responding…</small></p>}
          </div>
          {role === 'omar' && <button type="button" disabled={busy || !state}
            onClick={() => act('chat', { role, briefingOnly: true, message: 'What is finished, what is held up and what needs my decision?' })}>
            Quick briefing
          </button>}
          <form onSubmit={event => { event.preventDefault(); sendMessage(message) }}>
            <label htmlFor="office-message">Message for {teamMember.name}</label>
            <textarea id="office-message" value={message} maxLength={4000} onChange={event => setMessage(event.target.value)}
              placeholder="What would you like to cover?" required />
            <button type="submit" disabled={busy || !state?.modelReady || !message.trim()}>Send message</button>
          </form>
          <VoiceControls key={role} role={role} text={latest?.spokenSummary || latest?.content}
            draft={message} onTranscript={setMessage} onSend={sendMessage} disabled={busy || !state?.modelReady} />
        </section>
        <WorkSummary tasks={assignments} open={openTask} />
        </div>
        <details className={styles.panel}>
          <summary>Visit a teammate</summary>
          <div className={styles.heading}>
            <h2 id="floor-heading">Meet your team</h2>
            <span>{counts.open} open · {counts.blocked} blocked · {counts.decision} for your decision</span>
          </div>
          <p className={styles.availability}>Choose a desk for a private conversation. Omar coordinates shared work.</p>
          <div className={styles.floor}>
            {Object.entries(roles).map(([key, member]) => {
              const relevant = assignments.filter(({ status, delegation }) =>
                key === 'omar' ? status === 'queued'
                  : key === 'emma' ? status === 'awaiting_quality_review'
                    : delegation?.specialist === key && ['assigned', 'revision_requested', 'blocked'].includes(status))
              return (
                <button className={styles.desk} type="button" key={key} aria-pressed={role === key}
                  onClick={() => {
                    setRole(key)
                    document.getElementById('chat-heading')?.focus()
                  }}>
                  <span className={styles.workstation} aria-hidden="true">
                    <span className={styles.chair} />
                    <span className={styles.portrait} data-person={key} />
                    <span className={styles.table}><span className={styles.laptop} /><span className={styles.notebook} /><span className={styles.cup} /></span>
                  </span>
                  <strong>{member.name}</strong>
                  <span>{member.title}</span>
                  <small className={styles.presence} data-working={workingRole === key}>{!state ? 'Loading status…' : workingRole === key ? 'Working on your request' : relevant.length ? `${relevant.length} open` : 'Ready when you need me'}</small>
                </button>
              )
            })}
          </div>
        </details>


      <details className={styles.panel}><summary>Company priorities and approved information</summary>
        <section className={styles.panel} aria-labelledby="strategy-heading">
          <h2 id="strategy-heading">Office strategy</h2>
          <form onSubmit={(event) => { event.preventDefault(); void act('strategy', { strategy }) }}>
            <label htmlFor="office-strategy">Current goals and priorities</label>
            <textarea id="office-strategy" value={strategy} onChange={(event) => setStrategy(event.target.value)} maxLength={4000} required />
            <button type="submit" disabled={busy || !state}>Save strategy</button>
          </form>
          <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);act('reference',{source:data.get('source'),fact:data.get('fact')},()=>form.reset())}}>
            <label>Source<input required name="source" maxLength={160} /></label>
            <label>Approved information<textarea required name="fact" maxLength={800} /></label><button disabled={busy}>Save to shared knowledge</button>
          </form>
          {state?.references?.map((r,i)=><p key={i}><strong>{r.source}</strong> · {r.fact}</p>)}
        </section>
      </details>
      </>}

      {view === 'meetings' && <div className={styles.panel}><Meetings state={state} act={act} busy={busy} workingRole={workingRole} /></div>}
      {view === 'team' && <Organisation visit={visit} />}
      {view === 'usage' && <Usage state={state} act={act} busy={busy} open={openTask} />}
      {['work','decision'].includes(view) && <section className={styles.panel} aria-labelledby="work-heading" aria-busy={busy}>
        <div className={styles.heading}>
          <h2 id="work-heading">{view === 'decision' ? 'For your approval' : 'Team work'}</h2>
          <button type="button" disabled={busy} onClick={refresh}>Refresh</button>
        </div>
        {busy && <p role="status">Office action in progress…</p>}
        {view === 'decision' && !counts.decision && <p>Nothing needs your approval.</p>}
        {view === 'work' && !assignments.some(task => !['awaiting_owner_review', 'completed'].includes(task.status)) && <p>No work in progress.</p>}
        {assignments.filter(t=>t.kind === 'goal' && (view === 'work' || needsDecision(t))).map(t=><GoalCard key={t.id} task={t} tasks={assignments} act={act} busy={busy} ask={askButton} open={openTask} />)}
        {assignments.filter(t=>t.kind !== 'goal').filter(task => view === 'decision' ? task.status === 'awaiting_owner_review' : !['awaiting_owner_review', 'completed'].includes(task.status)).map((task) => (
          <article id={'task-' + task.id} key={task.id} className={styles.task}>
            <div className={styles.heading}>
              <strong>{task.brief}</strong>
              <span>{labels[task.status]}</span>
            </div>
            <p><strong>Next</strong> {nextStep(task)}</p>
            {askButton(task)}
            {!task.kind && <button disabled={busy} onClick={()=>act('plan_existing',{id:task.id})}>Review a strategy before continuing</button>}
            {task.deadline && <p>Due · {task.deadline}</p>}
            {task.delegation && <details><summary>Omar’s plan · Lead: {roles[task.delegation.specialist].name}</summary>
              {task.delegation.goal && <p><strong>Goal</strong> {task.delegation.goal}</p>}
              <p>{task.delegation.instructions}</p>
              {task.delegation.planSteps?.length > 0 && <ol>{task.delegation.planSteps.map((step,i)=><li key={i}>{step}</li>)}</ol>}
              <p><strong>Success criteria</strong> {task.delegation.criteria}</p>
              {task.delegation.consultations?.map(item=><p key={item.role}><strong>{roles[item.role].name}</strong> · {item.question}</p>)}
            </details>}
            <p><small>Latest handover · {roles[task.history.at(-1)?.by]?.name || 'You'} · {task.history.at(-1)?.action.replaceAll('_',' ')}</small></p>
            {task.status === 'awaiting_owner_review' && task.recommendation && <p><strong>Omar recommends</strong> {task.recommendation}</p>}
            {task.deliverable && <p className={styles.content}>{task.deliverable.content}</p>}
            {task.status === 'blocked' && <p>{task.history.at(-1)?.note}</p>}
            {task.review && <p><strong>Emma · {task.review.verdict}</strong> {task.review.reasons}</p>}
            <details>
              <summary>Assignment history</summary>
              <ol>
                {task.history.map((event, index) => (
                  <li key={index}>
                    <strong>{roles[event.by]?.name ?? 'You'}</strong> · {event.action.replaceAll('_', ' ')} · <time dateTime={event.at}>{event.at}</time>
                    {event.instructions && <p>{event.instructions} · Criteria: {event.criteria}</p>}
                    {(event.note || event.reasons || event.content) && <p className={styles.content}>{event.note || event.reasons || event.content}</p>}
                  </li>
                ))}
              </ol>
            </details>
            {task.pause && <><p role="status">{task.pause}</p><button type="button" disabled={busy} onClick={() => act('retry', { id: task.id })}>Resume with Omar</button></>}
            {['blocked', 'quality_blocked'].includes(task.status) && (
              <form onSubmit={(event) => {
                event.preventDefault()
                void act('unblock', { id: task.id, evidence: new FormData(event.currentTarget).get('evidence') })
              }}>
                <label htmlFor={'evidence-' + task.id}>Additional evidence to unblock this task</label>
                <textarea id={'evidence-' + task.id} maxLength={12000} name="evidence" required />
                <button type="submit" disabled={busy}>Add evidence and reopen</button>
              </form>
            )}
            {task.status === 'awaiting_owner_review' && (
              <form onSubmit={(event) => {
                event.preventDefault()
                void act('decide', { id: task.id, accepted: event.nativeEvent.submitter?.value === 'accept', note: new FormData(event.currentTarget).get('note') || (event.nativeEvent.submitter?.value === 'accept' ? 'Approved by Nabil.' : '') })
              }}>
                <label htmlFor={'note-' + task.id}>Comments for the team (required for changes)</label>
                <textarea id={'note-' + task.id} maxLength={2000} name="note" />
                <div className={styles.heading}>
                  <button type="submit" value="accept" disabled={busy}>Approve</button>
                  <button type="submit" value="revise" disabled={busy}>Request revision</button>
                </div>
              </form>
            )}
          </article>
        ))}
        {view === 'work' && assignments.some(task => task.status === 'completed') && <details open={assignments.some(task => task.id === selectedTask && task.status === 'completed') || undefined}>
          <summary>Reviewed work</summary>
          {assignments.filter(task => task.status === 'completed').map(task => <article id={'task-' + task.id} key={task.id}>
            <strong>{task.brief}</strong><p className={styles.content}>{task.deliverable?.content}</p>
            {task.kind === 'delivery' && <p>{roles[task.delegation.specialist].name} · {task.deadline} · Emma’s review: {task.review?.reasons}</p>}
            {askButton(task)}
          </article>)}
        </details>}
      </section>}
    </main>
    </>
  )
}
