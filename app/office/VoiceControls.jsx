'use client'

import { useEffect, useRef, useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'

const profiles = {
  omar: { names: ['ryan', 'daniel', 'george', 'uk english male', 'british english male'] },
  sarah: { names: ['sonia', 'kate', 'hazel', 'uk english female', 'british english female'] },
  daniel: { names: ['daniel', 'thomas', 'guy', 'ryan', 'uk english male', 'british english male'] },
  ahmed: { names: ['george', 'oli', 'ryan', 'daniel', 'uk english male', 'british english male'] },
  emma: { names: ['serena', 'libby', 'susan', 'sonia', 'uk english female', 'british english female'] },
}

function findVoice(voices, profile) {
  const english = voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang))
  const matched = english.filter(voice => profile.names.some(name => voice.name.toLowerCase().includes(name)))
  const quality = voice => /natural|neural|premium|enhanced/i.test(voice.name)
  const preferred = profile.names.slice(0, 2).flatMap(name => matched.filter(voice => voice.name.toLowerCase().includes(name)))
  return preferred.find(quality)
    ?? preferred.find(voice => voice.localService === false)
    ?? (preferred.length && profile !== profiles.omar ? preferred[0] : undefined)
    ?? matched.find(quality)
    ?? matched.find(voice => /google/i.test(voice.name))
    ?? profile.names.map(name => matched.find(voice => voice.name.toLowerCase().includes(name))).find(Boolean)
    ?? english.find(voice => voice.lang === 'en-GB' && quality(voice))
    ?? english.find(voice => voice.lang === 'en-GB')
    ?? english.find(voice => voice.default)
    ?? english[0]
}

export default function VoiceControls({ role, text, draft, onTranscript, onSend, disabled }) {
  const [status, setStatus] = useState('')
  const [phase, setPhase] = useState('idle')
  const [heard, setHeard] = useState('')
  const listening = phase !== 'idle'
  const current = useRef({ draft, onTranscript, onSend, disabled })
  useEffect(() => {
    current.current = { draft, onTranscript, onSend, disabled }
  }, [draft, onTranscript, onSend, disabled])
  useEffect(() => { window.speechSynthesis?.getVoices() }, [])
  const [speaking, setSpeaking] = useState(false)
  const recognition = useRef(null)
  const listenTimer = useRef(null)
  const playback = useRef(null)
  const speechTimer = useRef(null)

  useEffect(() => () => {
    clearTimeout(listenTimer.current)
    clearTimeout(speechTimer.current)
    if (playback.current) {
      playback.current = null
      window.speechSynthesis?.cancel()
    }
    if (recognition.current) {
      const recorder = recognition.current
      recognition.current = null
      recorder.abort()
    }
  }, [])

  function stopSpeech() {
    clearTimeout(speechTimer.current)
    playback.current = null
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }

  function listen() {
    if (recognition.current) return
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setStatus('Voice input is unavailable in this browser. You can type your message.')
      return
    }
    stopSpeech()
    const recorder = new Recognition()
    recognition.current = recorder
    recorder.lang = 'en-GB'
    recorder.continuous = true
    recorder.interimResults = true
    let words = ''
    let sendRequested = false

    function finish(problem = '') {
      if (recognition.current !== recorder) return
      clearTimeout(listenTimer.current)
      recognition.current = null
      setPhase('idle')
      setHeard('')
      const latest = current.current
      const message = [latest.draft.trim(), words.trim()].filter(Boolean).join(' ')
      if (words) latest.onTranscript(message)
      if (message.length > 4000) {
        setStatus('Please shorten your words before sending.')
      } else if (words && sendRequested && !problem && !latest.disabled) {
        setStatus('')
        latest.onSend(message)
      } else {
        setStatus(problem || (words ? 'Your words are in the message box. You can edit or send them.' : 'No words came through. Try again or type your message.'))
      }
    }

    function timeoutAfter(ms, message) {
      clearTimeout(listenTimer.current)
      listenTimer.current = setTimeout(() => {
        finish(message)
        recorder.abort()
      }, ms)
    }

    recorder.onstart = () => {
      if (recognition.current !== recorder) return
      setPhase('listening')
      setStatus('Listening. Speak now.')
      timeoutAfter(90000, 'The microphone stopped. Check your message before sending.')
    }
    recorder.onresult = event => {
      if (recognition.current !== recorder) return
      words = Array.from(event.results).map(result => result[0].transcript.trim()).filter(Boolean).join(' ')
      setHeard(words)
    }
    recorder.onerror = event => finish(['not-allowed', 'service-not-allowed'].includes(event.error)
      ? 'Allow microphone access in your browser, or type your message.'
      : 'The microphone stopped. You can type or try again.')
    recorder.onend = () => finish()
    recorder.finishAndSend = () => {
      if (sendRequested) return
      sendRequested = true
      setPhase('finishing')
      setStatus('Finishing your message…')
      timeoutAfter(4500, 'Check your words in the message box and press Send.')
      try { recorder.stop() } catch { finish('Check your message before sending.') }
    }
    setPhase('starting')
    setHeard('')
    setStatus('Starting microphone…')
    timeoutAfter(10000, 'The microphone did not start. Check microphone access or type your message.')
    try { recorder.start() } catch { finish('The microphone could not start. Try again or type your message.') }
  }

  function speak() {
    const synth = window.speechSynthesis
    if (!synth || !window.SpeechSynthesisUtterance) {
      setStatus('Voice playback is unavailable in this browser.')
      return
    }
    stopSpeech()
    const profile = profiles[role]
    const voice = findVoice(synth.getVoices(), profile)
    const sentences = (text || `Hello, I’m ${roles[role].name}. What would you like to discuss?`)
      .replace(/[*#_`]/g, '').trim()
      .match(/[^.!?\n]+[.!?]*|[.!?]+/g) ?? []
    const words = sentences.flatMap(sentence => sentence.match(/.{1,200}(?:\s|$)|.{1,200}/g) ?? [])
    const request = {}
    playback.current = request
    function finish(message) {
      if (playback.current !== request) return
      clearTimeout(speechTimer.current)
      playback.current = null
      setSpeaking(false)
      setStatus(message)
    }
    function next(index) {
      if (playback.current !== request) return
      if (!words[index]) {
        finish('Finished speaking.')
        return
      }
      const utterance = new SpeechSynthesisUtterance(words[index].trim())
      if (voice) utterance.voice = voice
      utterance.lang = voice?.lang ?? 'en-GB'
      utterance.pitch = 1
      utterance.rate = 1
      utterance.onend = () => {
        if (playback.current !== request) return
        clearTimeout(speechTimer.current)
        next(index + 1)
      }
      utterance.onerror = () => finish('Voice playback stopped. You can still read the reply.')
      speechTimer.current = setTimeout(() => {
        if (playback.current !== request) return
        finish('Voice playback took too long. You can still read the reply.')
        synth.cancel()
      }, 25000)
      synth.speak(utterance)
    }
    setSpeaking(true)
    setStatus(`${roles[role].name} is speaking…`)
    next(0)
  }

  return (
    <fieldset>
      <legend>Voice</legend>
      {listening
        ? <button type="button" disabled={phase !== 'listening' || disabled} onClick={() => recognition.current?.finishAndSend()}>
          {phase === 'starting' ? 'Starting microphone…' : phase === 'finishing' ? 'Finishing…' : 'Finish and send'}
        </button>
        : <button type="button" onClick={listen} disabled={disabled}>Speak</button>}
      {speaking
        ? <button type="button" onClick={() => { stopSpeech(); setStatus('Playback stopped.') }}>Stop speaking</button>
        : <button type="button" onClick={speak} disabled={listening}>{text ? 'Hear summary' : `Hear ${roles[role].name}’s voice`}</button>}
      {status && <p role="status">{status}</p>}
      {heard && <p>{heard}</p>}
      <small>Your browser handles voice input.</small>
    </fieldset>
  )
}
