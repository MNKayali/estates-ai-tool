'use client'

import { useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'
import VoiceControls from './VoiceControls'

export default function Meetings({ state, act, busy, workingRole }) {
  const [topic, setTopic] = useState('')
  const [participants, setParticipants] = useState(['omar', 'emma'])
  const [selectedId, setSelectedId] = useState('')
  const [speaker, setSpeaker] = useState('omar')
  const [message, setMessage] = useState('')
  const meetings = state?.meetings ?? []
  const meeting = meetings.find(item => item.id === selectedId) ?? meetings.at(-1)
  const activeSpeaker = meeting?.participants.includes(speaker) ? speaker : meeting?.participants[0] ?? 'omar'
  const lastReply = meeting?.turns.filter(turn => turn.role === activeSpeaker).at(-1)

  function ask(words) {
    if (!words.trim()) return
    void act('meeting_ask', { id: meeting.id, role: activeSpeaker, message: words }, () => {
      setMessage(current => current === words ? '' : current)
    })
  }

  return (
    <section aria-labelledby="meetings-title">
      <h2 id="meetings-title">Meeting room</h2>
      <form onSubmit={event => {
        event.preventDefault()
        void act('meeting_create', { topic, participants }, data => {
          setSelectedId(data.meetings.at(-1).id)
          setTopic('')
          setMessage('')
        })
      }}>
        <label htmlFor="meeting-topic">What would you like to discuss?</label>
        <textarea id="meeting-topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={4000} required />
        <fieldset><legend>Invite teammates</legend>
          {Object.entries(roles).map(([key, member]) => (
            <label key={key}>
              <input type="checkbox" checked={participants.includes(key)} onChange={event => setParticipants(event.target.checked
                ? [...participants, key] : participants.filter(item => item !== key))} />
              {member.name}
            </label>
          ))}
        </fieldset>
        <button disabled={busy || !state || !participants.length}>Start meeting</button>
      </form>
      {meeting && <>
        <label htmlFor="meeting-list">Saved meetings</label>
        <select id="meeting-list" value={meeting.id} disabled={busy} onChange={event => { setSelectedId(event.target.value); setMessage('') }}>
          {meetings.map(item => <option value={item.id} key={item.id}>{item.topic} — {item.status}</option>)}
        </select>
        <ol aria-label="Meeting discussion">
          {meeting.turns.map((turn, index) => <li key={index}>
            <strong>{roles[turn.role]?.name ?? 'You'}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{turn.content}</p>
          </li>)}
        </ol>
        <label htmlFor="meeting-speaker">Speak with</label>
        <select id="meeting-speaker" value={activeSpeaker} disabled={busy} onChange={event => setSpeaker(event.target.value)}>
          {meeting.participants.map(key => <option value={key} key={key}>{roles[key].name}</option>)}
        </select>
        <VoiceControls key={meeting.id + activeSpeaker} role={activeSpeaker} text={lastReply?.spokenSummary || lastReply?.content}
          draft={message} onTranscript={setMessage} onSend={ask} disabled={busy || !state?.modelReady || meeting.status !== 'open'} />
        {meeting.status === 'open' && <>
          <form onSubmit={event => { event.preventDefault(); ask(message) }}>
            <label htmlFor="meeting-message">Your contribution</label>
            <textarea id="meeting-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={4000} required />
            <button disabled={busy || !state.modelReady || !message.trim()}>Ask {roles[activeSpeaker].name}</button>
          </form>
          {workingRole && <p role="status">{roles[workingRole].name} is working…</p>}
          <button type="button" disabled={busy || !state.modelReady}
            onClick={() => act('meeting_turn', { id: meeting.id, role: activeSpeaker })}>Invite {roles[activeSpeaker].name} to respond</button>
          <button type="button" disabled={busy} onClick={() => act('meeting_end', { id: meeting.id })}>End meeting</button>
        </>}
      </>}
    </section>
  )
}
