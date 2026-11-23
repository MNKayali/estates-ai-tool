'use client'

import { useEffect, useRef, useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'
import VoiceControls from './VoiceControls'
import Meetings from './Meetings'
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

export default function Office() {
  const [state, setState] = useState(null)
  const [view, setView] = useState('brief')
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

  const managing = state?.assignments.some(task =>
    !task.pause && ['queued', 'assigned', 'in_progress', 'revision_requested', 'awaiting_quality_review', 'with_gm'].includes(task.status))
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
          <button type="button" aria-pressed={view === 'brief'} onClick={() => { setRole('omar'); setView('brief') }}>Brief Omar</button>
          <button type="button" aria-pressed={view === 'work'} onClick={() => setView('work')}>In progress</button>
          <button type="button" aria-pressed={view === 'decision'} onClick={() => setView('decision')}>For your approval ({counts.decision})</button>
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
      {view === 'brief' && <>
        <section className={styles.panel} aria-labelledby="chat-heading">
          <h2 id="chat-heading" tabIndex={-1}>{role === 'omar' ? 'Brief Omar' : 'Talk to ' + teamMember.name}</h2>
          <p>{role === 'omar' ? 'Give Omar an outcome. He assigns the work, arranges review and brings it back for your decision.' : teamMember.responsibilities}</p>
          <p>{teamMember.title} · Reports to {teamMember.reportsTo.toLowerCase() === 'owner' ? 'you' : teamMember.reportsTo}</p>
          <details>
            <summary>Responsibilities, goals and draft KPIs</summary>
            <p>{teamMember.responsibilities}</p>
            <p>{teamMember.collaboration}</p>
            {[...teamMember.goals, ...teamMember.proposedKpis].map((item) => <p key={item}>{item}</p>)}
          </details>
          {busy && <p role="status">{workingRole
            ? `${roles[workingRole].name} is working. You can still view other desks.`
            : 'Saving your changes…'}</p>}
          {role === 'omar' && <button type="button" disabled={busy || !state?.modelReady}
            onClick={() => act('chat', { role, briefingOnly: true, message: 'Give me my office briefing. What matters today? What is held up? What needs my decision?' })}>
            Quick briefing
          </button>}
          {latest && <div className={styles.content} aria-live="polite">
            <p><strong>{teamMember.name}</strong></p>
            <p>{latest.content}</p>
            {latest.assignmentId && <button type="button" onClick={() => {
              const task = assignments.find(item => item.id === latest.assignmentId)
              setView(task?.status === 'awaiting_owner_review' ? 'decision' : 'work')
            }}>View team work</button>}
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

      <details className={styles.panel}><summary>Meeting room</summary>
        <Meetings state={state} act={act} busy={busy} workingRole={workingRole} />
      </details>
      <details className={styles.panel}><summary>Office strategy</summary>
        <section className={styles.panel} aria-labelledby="strategy-heading">
          <h2 id="strategy-heading">Office strategy</h2>
          <form onSubmit={(event) => { event.preventDefault(); void act('strategy', { strategy }) }}>
            <label htmlFor="office-strategy">Current goals and priorities</label>
            <textarea id="office-strategy" value={strategy} onChange={(event) => setStrategy(event.target.value)} maxLength={4000} required />
            <button type="submit" disabled={busy || !state}>Save strategy</button>
          </form>
        </section>
      </details>
      </>}

      {view !== 'brief' && <section className={styles.panel} aria-labelledby="work-heading" aria-busy={busy}>
        <div className={styles.heading}>
          <h2 id="work-heading">{view === 'decision' ? 'For your approval' : 'Team work'}</h2>
          <button type="button" disabled={busy} onClick={refresh}>Refresh</button>
        </div>
        {busy && <p role="status">Office action in progress…</p>}
        {view === 'decision' && !counts.decision && <p>Nothing needs your approval.</p>}
        {view === 'work' && !assignments.some(task => !['awaiting_owner_review', 'completed'].includes(task.status)) && <p>No work in progress.</p>}
        {assignments.filter(task => view === 'decision' ? task.status === 'awaiting_owner_review' : !['awaiting_owner_review', 'completed'].includes(task.status)).map((task) => (
          <article key={task.id} className={styles.task}>
            <div className={styles.heading}>
              <strong>{task.brief}</strong>
              <span>{labels[task.status]}</span>
            </div>
            {task.delegation && <p>Assigned to {roles[task.delegation.specialist].name}</p>}
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
        {view === 'work' && assignments.some(task => task.status === 'completed') && <details>
          <summary>Approved work</summary>
          {assignments.filter(task => task.status === 'completed').map(task => <article key={task.id}>
            <strong>{task.brief}</strong><p className={styles.content}>{task.deliverable?.content}</p>
          </article>)}
        </details>}
      </section>}
    </main>
    </>
  )
}
