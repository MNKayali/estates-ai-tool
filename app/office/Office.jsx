'use client'

import { useEffect, useRef, useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'
import VoiceControls from './VoiceControls'
import Meetings from './Meetings'
import styles from './office.module.css'

const steps = {
  queued: 'Ask Omar to assign',
  assigned: 'Ask specialist to do the work',
  revision_requested: 'Ask specialist to revise',
  awaiting_quality_review: 'Ask Emma to review',
}

const labels = {
  queued: 'With Omar', assigned: 'Assigned', in_progress: 'In progress',
  blocked: 'Blocked', quality_blocked: 'Blocked by Emma', revision_requested: 'Revision requested',
  awaiting_quality_review: 'With Emma', awaiting_owner_review: 'Your decision', completed: 'Completed',
}

async function loadOffice(signal = AbortSignal.timeout(8000)) {
  const response = await fetch('/api/office', { cache: 'no-store', signal })
  if (response.status === 403) throw new Error('Your office sign-in has expired. Reload the page to sign in again.')
  if (!response.ok) throw new Error('Could not load the office. Try Reload office.')
  return response.json()
}

export default function Office() {
  const [state, setState] = useState(null)
  const [role, setRole] = useState('omar')
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
  const [brief, setBrief] = useState('')
  const [evidence, setEvidence] = useState('')

  function displayOffice(data) {
    setState(data)
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

  async function act(action, fields, onSuccess) {
    if (!state || actionInFlight.current) return
    actionInFlight.current = true
    setError('')
    setBusy(true)
    const task = action === 'run' ? state.assignments.find(item => item.id === fields.id) : null
    const taskRole = task?.status === 'queued' ? 'omar'
      : task?.status === 'awaiting_quality_review' ? 'emma' : task?.delegation?.specialist
    setWorkingRole(fields.role ?? (action === 'run' ? taskRole : null))
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
      setState(data)
      onSuccess?.(data)
    } catch (failure) {
      setError(failure.name === 'TimeoutError' || failure.name === 'AbortError'
        ? 'The office did not answer in time. Your draft is still here. Refresh to check whether a reply was saved before trying again.'
        : failure.message || 'Could not complete the action.')
    } finally {
      actionInFlight.current = false
      setBusy(false)
      setWorkingRole(null)
    }
  }

  const teamMember = roles[role]
  const assignments = state?.assignments ?? []
  const chat = state?.chats[role] ?? []
  const latest = chat.at(-1)
  function sendMessage(words) {
    if (!words.trim()) return
    void act('chat', { role, message: words }, () => {
      setDrafts(previous => previous[role] === words ? { ...previous, [role]: '' } : previous)
    })
  }
  const counts = {
    open: assignments.filter(({ status }) => status !== 'completed').length,
    blocked: assignments.filter(({ status }) => ['blocked', 'quality_blocked'].includes(status)).length,
    decision: assignments.filter(({ status }) => status === 'awaiting_owner_review').length,
  }

  return (
    <>
    <main className={styles.office}>
      <header className={styles.header}>
        <div><span className={styles.brand}>PROJENTO</span><h1>Your AI office</h1></div>
        <nav aria-label="Office">
          <a href="#floor-heading">Team</a>
          <a href="#meetings-title">Meetings</a>
          <a href="#work-heading">Assignments</a>
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
      {!state && <button type="button" onClick={refresh}>Reload office</button>}
      {state && !state.modelReady && <p role="status">Agent conversations and execution need an office model to be configured.</p>}
      <div className={styles.workspace}>
        <section aria-labelledby="floor-heading">
          <div className={styles.heading}>
            <h2 id="floor-heading">Meet your team</h2>
            <span>{counts.open} open · {counts.blocked} blocked · {counts.decision} for your decision</span>
          </div>
          <p className={styles.availability}>The team works when you start a conversation or task. Choose a desk to speak with a teammate.</p>
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
                  <small className={styles.presence} data-working={workingRole === key}>{!state ? 'Loading status…' : workingRole === key ? 'Working on your request' : relevant.length ? `${relevant.length} waiting for your instruction` : 'Ready when you need me'}</small>
                </button>
              )
            })}
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="chat-heading">
          <h2 id="chat-heading" tabIndex={-1}>Talk to {teamMember.name}</h2>
          <p>{teamMember.title} · Reports to {teamMember.reportsTo.toLowerCase() === 'owner' ? 'you' : teamMember.reportsTo}</p>
          <details>
            <summary>Responsibilities, goals and draft KPIs</summary>
            <p>{teamMember.responsibilities}</p>
            {[...teamMember.goals, ...teamMember.proposedKpis].map((item) => <p key={item}>{item}</p>)}
          </details>
          {busy && <p role="status">{workingRole
            ? `${roles[workingRole].name} is working. You can still view other desks.`
            : 'Saving your changes…'}</p>}
          {role === 'omar' && <button type="button" disabled={busy || !state?.modelReady}
            onClick={() => act('chat', { role, message: 'Give me my office briefing. What matters today? What is held up? What needs my decision?' })}>
            Quick briefing
          </button>}
          {latest && <div className={styles.content} aria-live="polite">
            <p><strong>{teamMember.name}</strong></p>
            <p>{latest.content}</p>
          </div>}
          <form onSubmit={event => { event.preventDefault(); sendMessage(message) }}>
            <label htmlFor="office-message">Message for {teamMember.name}</label>
            <textarea id="office-message" value={message} maxLength={4000} onChange={event => setMessage(event.target.value)}
              placeholder="What would you like to cover?" required />
            <button type="submit" disabled={busy || !state?.modelReady || !message.trim()}>Send message</button>
          </form>
          <VoiceControls key={role} role={role} text={latest?.spokenSummary || latest?.content}
            draft={message} onTranscript={setMessage} onSend={sendMessage} disabled={busy || !state?.modelReady} />
          {chat.length > 0 && <details key={role + '-history'}>
            <summary>Conversation history</summary>
            <ol className={styles.chat} aria-label={`Conversation with ${teamMember.name}`}>
              {chat.map((turn, index) => <li key={index}>
                <p><strong>You</strong> {turn.message}</p>
                <p className={styles.content}><strong>{teamMember.name}</strong> {turn.content}</p>
              </li>)}
            </ol>
          </details>}
        </section>
      </div>

      <Meetings state={state} act={act} busy={busy} workingRole={workingRole} />
      <div className={styles.workspace}>
        <section className={styles.panel} aria-labelledby="assignment-heading">
          <h2 id="assignment-heading">New assignment for Omar</h2>
          <form onSubmit={(event) => { event.preventDefault(); void act('create', { brief, evidence }, () => { setBrief(''); setEvidence('') }) }}>
            <label htmlFor="office-brief">What should the team deliver?</label>
            <textarea id="office-brief" value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={4000} required />
            <label htmlFor="office-evidence">Supporting evidence (optional)</label>
            <textarea id="office-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={12000} />
            <button type="submit" disabled={busy || !state}>Create assignment</button>
          </form>
        </section>
        <section className={styles.panel} aria-labelledby="strategy-heading">
          <h2 id="strategy-heading">Office strategy</h2>
          <form onSubmit={(event) => { event.preventDefault(); void act('strategy', { strategy }) }}>
            <label htmlFor="office-strategy">Current goals and priorities</label>
            <textarea id="office-strategy" value={strategy} onChange={(event) => setStrategy(event.target.value)} maxLength={4000} required />
            <button type="submit" disabled={busy || !state}>Save strategy</button>
          </form>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="work-heading" aria-busy={busy}>
        <div className={styles.heading}>
          <h2 id="work-heading">Assignments</h2>
          <button type="button" disabled={busy} onClick={refresh}>Refresh</button>
        </div>
        {busy && <p role="status">Office action in progress…</p>}
        {!assignments.length && <p>No assignments yet.</p>}
        {assignments.map((task) => (
          <article key={task.id} className={styles.task}>
            <div className={styles.heading}>
              <strong>{task.brief}</strong>
              <span>{labels[task.status]}</span>
            </div>
            {task.delegation && <p>Assigned to {roles[task.delegation.specialist].name}</p>}
            {task.deliverable && <p className={styles.content}>{task.deliverable.content}</p>}
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
            {steps[task.status] && <button type="button" disabled={busy || !state.modelReady}
              onClick={() => act('run', { id: task.id })}>{steps[task.status]}</button>}
            {task.status === 'blocked' && (
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
                void act('decide', { id: task.id, accepted: event.nativeEvent.submitter?.value === 'accept', note: new FormData(event.currentTarget).get('note') })
              }}>
                <label htmlFor={'note-' + task.id}>Decision note</label>
                <textarea id={'note-' + task.id} maxLength={2000} name="note" required />
                <div className={styles.heading}>
                  <button type="submit" value="accept" disabled={busy}>Accept deliverable</button>
                  <button type="submit" value="revise" disabled={busy}>Request revision</button>
                </div>
              </form>
            )}
          </article>
        ))}
      </section>
    </main>
    </>
  )
}
