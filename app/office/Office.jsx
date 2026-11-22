'use client'

import { useEffect, useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'
import { Header } from '../admin/shared'
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

async function loadOffice(signal) {
  const response = await fetch('/api/office', { cache: 'no-store', signal })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  return data
}

export default function Office() {
  const [state, setState] = useState(null)
  const [role, setRole] = useState('omar')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [strategy, setStrategy] = useState('')
  const [brief, setBrief] = useState('')
  const [evidence, setEvidence] = useState('')

  function displayOffice(data) {
    setState(data)
    setStrategy(data.strategy)
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
    void loadOffice(controller.signal).then(displayOffice, showLoadError)
    return () => controller.abort()
  }, [])

  async function act(action, fields, onSuccess) {
    setError('')
    setBusy(true)
    try {
      const response = await fetch('/api/office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: state.revision, ...fields }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setState(data)
      onSuccess?.()
    } catch (failure) {
      setError(failure.message || 'Could not complete the action.')
    } finally {
      setBusy(false)
    }
  }

  const teamMember = roles[role]
  const assignments = state?.assignments ?? []
  const chat = state?.chats[role] ?? []
  const counts = {
    open: assignments.filter(({ status }) => status !== 'completed').length,
    blocked: assignments.filter(({ status }) => ['blocked', 'quality_blocked'].includes(status)).length,
    decision: assignments.filter(({ status }) => status === 'awaiting_owner_review').length,
  }

  return (
    <>
    <Header current="office" />
    <main className={styles.office}>
      <header className={styles.header}>
        <h1>Projento Office</h1>
        <span>Owner workspace</span>
      </header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!state && <button type="button" onClick={refresh}>Reload office</button>}
      {state && !state.modelReady && <p role="status">Agent conversations and execution need an office model to be configured.</p>}
      <div className={styles.workspace}>
        <section aria-labelledby="floor-heading">
          <div className={styles.heading}>
            <h2 id="floor-heading">Office floor</h2>
            <span>{counts.open} open · {counts.blocked} blocked · {counts.decision} for your decision</span>
          </div>
          <div className={styles.floor}>
            {Object.entries(roles).map(([key, member]) => {
              const relevant = assignments.filter(({ status, delegation }) =>
                key === 'omar' ? status === 'queued'
                  : key === 'emma' ? status === 'awaiting_quality_review'
                    : delegation?.specialist === key && ['assigned', 'revision_requested', 'blocked'].includes(status))
              return (
                <button className={styles.desk} type="button" key={key} aria-pressed={role === key}
                  disabled={busy} onClick={() => { setRole(key); setMessage('') }}>
                  <span className={styles.avatar} aria-hidden="true">{member.name[0]}</span>
                  <strong>{member.name}</strong>
                  <span>{member.title}</span>
                  <small>{relevant.length ? `${relevant.length} awaiting action` : 'No tasks awaiting action'}</small>
                </button>
              )
            })}
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="chat-heading">
          <h2 id="chat-heading">Talk to {teamMember.name}</h2>
          <p>{teamMember.title} · Reports to {teamMember.reportsTo.toLowerCase() === 'owner' ? 'you' : teamMember.reportsTo}</p>
          <details>
            <summary>Responsibilities, goals and draft KPIs</summary>
            <p>{teamMember.responsibilities}</p>
            {[...teamMember.goals, ...teamMember.proposedKpis].map((item) => <p key={item}>{item}</p>)}
          </details>
          {chat.length > 0 && (
            <ol className={styles.chat} aria-label={`Conversation with ${teamMember.name}`}>
              {chat.map((turn, index) => (
                <li key={index}>
                  <p><strong>You</strong> {turn.message}</p>
                  <p><strong>{teamMember.name}</strong> {turn.content}</p>
                </li>
              ))}
            </ol>
          )}
          {role === 'omar' && (
            <button type="button" disabled={busy || !state?.modelReady}
              onClick={() => act('chat', { role, message: 'Give me my office briefing: what was completed, what is planned next, blockers, and decisions I need to make.' })}>
              Get a briefing
            </button>
          )}
          <form onSubmit={(event) => { event.preventDefault(); void act('chat', { role, message }, () => setMessage('')) }}>
            <label htmlFor="office-message">Message for {teamMember.name}</label>
            <textarea id="office-message" value={message} maxLength={4000} onChange={(event) => setMessage(event.target.value)} required />
            <button type="submit" disabled={busy || !state?.modelReady}>Send message</button>
          </form>
        </section>
      </div>

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
