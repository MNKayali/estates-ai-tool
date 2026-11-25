'use client'

import { useEffect, useRef, useState } from 'react'
import VoiceControls from './VoiceControls'
import s from './workspace.module.css'

const day = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const active = (job) => !['done', 'cancelled'].includes(job.stage)
const stage = (job) =>
  job.pause
    ? 'Paused'
    : {
        intake: 'Planning',
        produce: 'Preparing',
        qa: 'Quality review',
        done: 'Finished',
        cancelled: 'Superseded'
      }[job.stage]
const usd = (cents) => (cents / 100).toFixed(2)

function Settings({ data, submit, busy, close }) {
  const [agent, setAgent] = useState('omar')
  return (
    <aside className={s.settings} aria-label="Settings">
      <div className={s.row}>
        <h2>Settings</h2>
        <button onClick={close}>Close</button>
      </div>
      <form
        key={agent}
        onSubmit={(e) => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          const cents = (name) => Math.round(Number(form.get(name)) * 100)
          submit(
            {
              action: 'allowance',
              agent,
              monthlyCents: cents('office'),
              dailyCents: cents('daily'),
              agentMonthlyCents: cents('monthly')
            },
            close
          )
        }}
      >
        <label>
          Shared monthly allowance (US$)
          <input
            name="office"
            type="number"
            min="0"
            max="1000"
            step=".01"
            defaultValue={usd(data.monthlyCents)}
            required
          />
        </label>
        <label>
          Agent
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {Object.entries(data.agents).map(([id, a]) => (
              <option key={id} value={id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className={s.pair}>
          {[
            ['daily', 'Daily cap', data.agents[agent].dailyCents],
            ['monthly', 'Monthly cap', data.agents[agent].monthlyCents]
          ].map(([key, name, value]) => (
            <label key={key}>
              {name} (US$)
              <input name={key} type="number" min="0" max="1000" step=".01" defaultValue={usd(value)} required />
            </label>
          ))}
        </div>
        <small>
          One shared allowance covers all agents. Each agent must also stay within both personal limits.
        </small>
        <button disabled={busy} className={s.primary}>
          Save allowance
        </button>
      </form>
      <button
        onClick={async () => {
          if ((await fetch('/api/logout', { method: 'POST' })).ok) location.reload()
        }}
      >
        Sign out
      </button>
    </aside>
  )
}

function OutputReader({ item, data, onClose, submit, busy, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing)
  const [text, setText] = useState(item.body)
  const [notice, setNotice] = useState('')
  const paper = useRef(null)
  function download() {
    const url = URL.createObjectURL(
      new Blob([item.title + '\n\n' + item.body], { type: 'text/plain;charset=utf-8' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = item.title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 80) + '.txt'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <article className={s.reader}>
      <button onClick={onClose}>← Outputs</button>
      <p className={s.meta}>
        {item.status} · {day(item.at)} · Version {item.version}
      </p>
      <h1>{item.title}</h1>
      <p>{data.objectives.find((o) => o.id === item.objective)?.title}</p>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit({ action: 'decision', decision: 'edit', ids: [item.id], text }, onClose)
          }}
        >
          <label>
            Your edit
            <textarea required maxLength={6000} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button disabled={busy}>Send to Emma</button>
        </form>
      ) : (
        <div ref={paper} className={s.paper}>
          {item.body}
        </div>
      )}
      <div className={s.actions}>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(item.body)
              setNotice('Copied.')
            } catch {
              if (!paper.current) {
                setNotice('Select the draft text to copy it.')
                return
              }
              const range = document.createRange()
              range.selectNodeContents(paper.current)
              const selection = window.getSelection()
              selection.removeAllRanges()
              selection.addRange(range)
              setNotice(document.execCommand('copy') ? 'Copied.' : 'Text selected. Choose Copy in your browser.')
            }
          }}
        >
          Copy
        </button>
        <button onClick={download}>Download</button>
        {item.status === 'Awaiting my approval' && !editing && (
          <button onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>
      <small aria-live="polite">{notice}</small>
      <details>
        <summary>Review and sources</summary>
        <p>{item.review}</p>
        {Object.entries(item.sources || {}).map(([key, source]) => (
          <p key={key}>
            {key === 'website' ? 'Website' : 'Website visits'} · {source.source || source.note}
            {source.through && ' · ' + source.from + ' to ' + source.through}
            {source.visits != null && ' · ' + source.visits + ' recorded visits'}
          </p>
        ))}
      </details>
    </article>
  )
}

function Team({ data, submit, busy }) {
  const [adding, setAdding] = useState(false)
  return (
    <section>
      <div className={s.row}>
        <h1>Team</h1>
        <button onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add agent'}</button>
      </div>
      {adding && (
        <form
          className={s.card}
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            submit(
              {
                action: 'agent',
                name: f.get('name'),
                role: f.get('role'),
                instructions: f.get('instructions'),
                tools: f.getAll('tools')
              },
              () => setAdding(false)
            )
          }}
        >
          <label>
            Name
            <input required name="name" maxLength={50} />
          </label>
          <label>
            Role
            <input required name="role" maxLength={80} />
          </label>
          <label>
            Instructions
            <textarea required name="instructions" maxLength={1000} />
          </label>
          <fieldset>
            <legend>Tools allowed</legend>
            {[
              ['website', 'Read website'],
              ['analytics', 'Read visit totals']
            ].map(([key, title]) => (
              <label key={key}>
                <input type="checkbox" value={key} name="tools" />
                {title}
              </label>
            ))}
          </fieldset>
          <button className={s.primary} disabled={busy}>
            Save agent
          </button>
        </form>
      )}
      <div className={s.team}>
        {Object.entries(data.agents).map(([key, a]) => {
          const tasks = data.jobs.filter(
            (j) => (j.agent === key && j.stage !== 'qa') || (key === 'emma' && j.stage === 'qa')
          )
          const current = tasks.find((j) => j.running) || tasks.find(active)
          const last = data.outputs.find((o) => (key === 'emma' ? o.review : o.author === key))
          return (
            <article className={s.card} key={key}>
              <h2>{a.name}</h2>
              <p className={s.meta}>{a.role}</p>
              <dl>
                <dt>Current task</dt>
                <dd>{current ? stage(current) + ' · ' + current.title : 'Available'}</dd>
                <dt>Last output</dt>
                <dd>{last?.title || 'None yet'}</dd>
              </dl>
            </article>
          )
        })}
      </div>
      <details>
        <summary>Omar’s work list</summary>
        {data.objectives.map((o) => (
          <div key={o.id}>
            <h3>{o.title}</h3>
            <small>
              {o.priority} · {o.status}
            </small>
            {data.jobs
              .filter((j) => j.objective === o.id && j.criteria)
              .map((j) => (
                <p key={j.id}>
                  {data.agents[j.agent]?.name} · {stage(j)} · {j.title}
                  <br />
                  {j.deadline} · {j.criteria}
                </p>
              ))}
          </div>
        ))}
      </details>
    </section>
  )
}

export default function Office() {
  const [data, setData] = useState(null),
    [tab, setTab] = useState('Chat'),
    [settings, setSettings] = useState(false)
  const [open, setOpen] = useState(null),
    [draft, setDraft] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const lock = useRef(false),
    thread = useRef(null),
    retry = useRef(null)
  const merge = (next) => setData((prev) => (prev && prev.revision > next.revision ? prev : next))
  useEffect(() => {
    let mounted = true
    async function refresh() {
      try {
        const res = await fetch('/api/office', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
        if (!res.ok)
          throw new Error(
            res.status === 403 ? 'Sign in again to open your office.' : 'The office could not load. Trying again.'
          )
        const next = await res.json()
        if (mounted) merge(next)
      } catch (e) {
        if (mounted) setError(e.message)
      }
    }
    void refresh()
    const timer = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 4000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
  }, [data?.messages.length, tab])
  async function submit(fields, success) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    const fingerprint = JSON.stringify(fields)
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: crypto.randomUUID() }
    try {
      const response = await fetch('/api/office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, requestId: retry.current.id }),
        signal: AbortSignal.timeout(15000)
      })
      const next = await response.json()
      if (!response.ok) throw new Error(next.error || 'Could not save. Try again.')
      merge(next)
      retry.current = null
      success?.()
    } catch (e) {
      setError(e.message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function send(text) {
    if (text.trim())
      submit({ action: 'message', text: text.trim() }, () =>
        setDraft((previous) => (previous.trim() === text.trim() ? '' : previous))
      )
  }
  function read(id, edit = false) {
    setOpen({ id, edit })
    setTab('Outputs')
  }
  const item = data?.outputs.find((o) => o.id === open?.id)
  const review = (items, decision) => submit({ action: 'decision', ids: items.map((o) => o.id), decision })
  return (
    <main className={s.office}>
      <header>
        <span className={s.brand}>
          Projento <span>Office</span>
        </span>
        <button disabled={!data} onClick={() => setSettings(!settings)}>
          Settings
        </button>
      </header>
      <nav aria-label="Office">
        {['Chat', 'Outputs', 'Team'].map((name) => (
          <button
            key={name}
            aria-current={tab === name ? 'page' : undefined}
            onClick={() => {
              setTab(name)
              setSettings(false)
              setOpen(null)
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className={s.alert}>
          {error}
        </p>
      )}
      {!data && <p role="status">Opening your office…</p>}
      {settings && data && <Settings data={data} submit={submit} busy={busy} close={() => setSettings(false)} />}
      {tab === 'Chat' && data && (
        <section className={s.chat}>
          <div>
            <h1>Omar</h1>
            <p className={s.meta}>General Manager</p>
          </div>
          <div ref={thread} className={s.thread} role="log" aria-label="Conversation with Omar">
            {data.messages.map((m) => {
              const items = (m.outputs || []).map((id) => data.outputs.find((o) => o.id === id)).filter(Boolean)
              const pending = items.filter((o) => o.status === 'Awaiting my approval')
              const failed = m.failure && data.jobs.find((j) => j.id === m.failure)
              return (
                <article className={m.from === 'You' ? s.own : s.reply} key={m.id}>
                  <small>
                    {m.from} · {day(m.at)}
                    {m.type === 'daily' ? ' · Daily update' : ''}
                  </small>
                  <p>{m.failure && m.resolved ? 'The interrupted step resumed.' : m.text}</p>
                  {items.map((o) => (
                    <button className={s.file} key={o.id} onClick={() => read(o.id)}>
                      {o.title} ↗
                    </button>
                  ))}
                  {pending.length > 0 && (
                    <div className={s.approval}>
                      <small>
                        {pending[0].permission} · {pending[0].scope}
                      </small>
                      <div className={s.actions}>
                        <button disabled={busy} onClick={() => review(pending, 'approve')}>
                          Approve
                        </button>
                        {pending.length === 1 ? (
                          <button onClick={() => read(pending[0].id, true)}>Edit</button>
                        ) : (
                          <details>
                            <summary>Edit</summary>
                            {pending.map((o) => (
                              <button key={o.id} onClick={() => read(o.id, true)}>
                                {o.title}
                              </button>
                            ))}
                          </details>
                        )}
                        <button disabled={busy} onClick={() => review(pending, 'reject')}>
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                  {m.type === 'budget' && !m.resolved && (
                    <div className={s.actions}>
                      <button disabled={busy} onClick={() => submit({ action: 'allowance', monthlyCents: 300 })}>
                        Approve US$3 monthly
                      </button>
                      <button onClick={() => setSettings(true)}>Edit allowance</button>
                      <button disabled={busy} onClick={() => submit({ action: 'decline_allowance' })}>
                        Reject
                      </button>
                    </div>
                  )}
                  {failed?.pause && !failed.resume && (
                    <button disabled={busy} onClick={() => submit({ action: 'retry', jobId: failed.id })}>
                      Retry
                    </button>
                  )}
                </article>
              )
            })}
            {data.jobs.some((j) => j.stage === 'intake' && !j.pause) && (
              <small role="status">Omar is reading your message…</small>
            )}
          </div>
          <form
            className={s.composer}
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <textarea
              aria-label="Message Omar"
              placeholder="Give Omar an objective or ask a question…"
              rows={2}
              required
              maxLength={5000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className={s.primary} disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
          <details className={s.voice}>
            <summary>Voice conversation</summary>
            <VoiceControls
              role="omar"
              draft={draft}
              onTranscript={setDraft}
              onSend={send}
              disabled={busy}
              text={data.messages.filter((m) => m.from === 'Omar').at(-1)?.text}
            />
          </details>
        </section>
      )}
      {tab === 'Outputs' &&
        data &&
        (item ? (
          <OutputReader
            key={item.id}
            item={item}
            data={data}
            startEditing={open.edit}
            submit={submit}
            busy={busy}
            onClose={() => setOpen(null)}
          />
        ) : (
          <section>
            <h1>Outputs</h1>
            {!data.outputs.length && <p>Reviewed posts, plans and reports will appear here.</p>}
            {data.outputs.map((o) => (
              <button key={o.id} className={s.output} onClick={() => read(o.id)}>
                <span>
                  <strong>{o.title}</strong>
                  <small>
                    {data.objectives.find((g) => g.id === o.objective)?.label ||
                      data.objectives.find((g) => g.id === o.objective)?.title}
                  </small>
                </span>
                <span>
                  {o.status}
                  <small>{day(o.at)}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
      {tab === 'Team' && data && <Team data={data} busy={busy} submit={submit} />}
    </main>
  )
}
