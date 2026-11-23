'use client'

import { useEffect, useRef, useState } from 'react'
import { roles } from '@/lib/office/roles.mjs'

const profiles = {
  omar: { names: ['daniel', 'ryan', 'george', 'uk english male', 'british english male'], pitch: .88, rate: .92 },
  sarah: { names: ['sonia', 'kate', 'hazel', 'uk english female', 'british english female'], pitch: 1.1, rate: 1 },
  daniel: { names: ['ryan', 'thomas', 'guy', 'daniel', 'uk english male', 'british english male'], pitch: 1.05, rate: .98 },
  ahmed: { names: ['george', 'oli', 'ryan', 'daniel', 'uk english male', 'british english male'], pitch: .8, rate: .94 },
  emma: { names: ['serena', 'libby', 'susan', 'sonia', 'uk english female', 'british english female'], pitch: .96, rate: .89 },
}

function findVoice(voices, profile) {
  const english = voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang))
  for (const name of profile.names) {
    const match = english.find(voice => voice.name.toLowerCase().includes(name))
    if (match) return match
  }
  return english.find(voice => voice.lang === 'en-GB')
    ?? english.find(voice => voice.default)
    ?? english[0]
}

export default function VoiceControls({ role, text, onTranscript, disabled }) {
  const [status, setStatus] = useState('')
  const [listening, setListening] = useState(false)
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
      recognition.current.onresult = null
      recognition.current.onerror = null
      recognition.current.onend = null
      recognition.current.abort()
      recognition.current = null
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
    let heardWords = false
    recorder.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ').trim()
      if (!transcript) return
      heardWords = true
      onTranscript(transcript.slice(0, 4000))
      setStatus('Check your words, then send your message.')
    }
    recorder.onerror = event => {
      heardWords = true
      setStatus(['not-allowed', 'service-not-allowed'].includes(event.error)
        ? 'Microphone permission was denied. You can type your message.'
        : 'Could not hear that. Try again or type your message.')
    }
    recorder.onend = () => {
      clearTimeout(listenTimer.current)
      recognition.current = null
      setListening(false)
      if (!heardWords) setStatus('No speech was heard. Try again or type your message.')
    }
    try {
      recorder.start()
      listenTimer.current = setTimeout(() => {
        recorder.onend = null
        recorder.onresult = null
        recorder.onerror = null
        recorder.abort()
        recognition.current = null
        setListening(false)
        setStatus('The microphone timed out. Try again or type your message.')
      }, 45000)
      setListening(true)
      setStatus('Listening…')
    } catch {
      recognition.current = null
      setStatus('The microphone could not start. Try again or type your message.')
    }
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
    const words = (text || `Hello, I’m ${roles[role].name}. What would you like to discuss?`)
      .replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim()
      .match(/.{1,150}(?:\s|$)|.{1,150}/g) ?? []
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
      utterance.pitch = profile.pitch
      utterance.rate = profile.rate
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
      <legend>Voice conversation</legend>
      {listening
        ? <button type="button" onClick={() => { recognition.current?.stop(); setStatus('Processing your words…') }}>Finish speaking</button>
        : <button type="button" onClick={listen} disabled={disabled}>Use microphone</button>}
      {speaking
        ? <button type="button" onClick={() => { stopSpeech(); setStatus('Playback stopped.') }}>Stop speaking</button>
        : <button type="button" onClick={speak} disabled={listening}>{text ? 'Hear reply' : `Hear ${roles[role].name}’s voice`}</button>}
      <p>Voice input uses your browser’s speech service. Only the message you send is saved in the office.</p>
      <p role="status">{status}</p>
    </fieldset>
  )
}
