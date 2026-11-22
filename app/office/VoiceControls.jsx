'use client'

import { useEffect, useId, useRef, useState } from 'react'

export default function VoiceControls({ role, text, onTranscript, disabled }) {
  const voiceSelectId = useId()
  const listenTimer = useRef(null)
  const [voices, setVoices] = useState([])
  const [voiceId, setVoiceId] = useState('')
  const [status, setStatus] = useState('')
  const [listening, setListening] = useState(false)
  const recognition = useRef(null)

  useEffect(() => {
    const synth = window.speechSynthesis
    const load = () => {
      setVoices(synth?.getVoices() ?? [])
      try { setVoiceId(localStorage.getItem('office-voice-' + role) ?? '') } catch { setVoiceId('') }
    }
    const timer = setTimeout(load, 0)
    synth?.addEventListener('voiceschanged', load)
    return () => {
      clearTimeout(timer)
      synth?.removeEventListener('voiceschanged', load)
      synth?.cancel()
      clearTimeout(listenTimer.current)
      if (recognition.current) {
        recognition.current.onresult = null
        recognition.current.onerror = null
        recognition.current.onend = null
        recognition.current.abort()
      }
    }
  }, [role])

  function listen() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setStatus('Voice input is unavailable in this browser. You can type your message.')
      return
    }
    window.speechSynthesis?.cancel()
    const recorder = new Recognition()
    recognition.current = recorder
    recorder.lang = 'en-GB'
    recorder.continuous = false
    recorder.interimResults = false
    recorder.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ')
      onTranscript(transcript.slice(0, 4000))
      setStatus('Your words are ready. Check them, then send.')
    }
    recorder.onerror = event => setStatus(event.error === 'not-allowed'
      ? 'Microphone access was denied. Allow it in your browser or type your message.'
      : 'Could not hear that. Please try again or type your message.')
    recorder.onend = () => { clearTimeout(listenTimer.current); setListening(false); recognition.current = null }
    try {
      recorder.start()
      listenTimer.current = setTimeout(() => recorder.stop(), 60000)
      setListening(true)
      setStatus('Listening…')
    } catch {
      setStatus('The microphone could not start. Please try again.')
    }
  }

  function speak() {
    const voice = voices.find(item => item.voiceURI === voiceId)
    if (!voice) { setStatus('Choose and preview a voice first.'); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text || 'Hello. I am ready for our meeting.')
    utterance.voice = voice
    utterance.lang = voice.lang
    utterance.onend = () => setStatus('Finished speaking.')
    utterance.onerror = () => setStatus('Speech stopped. The written response is still available.')
    window.speechSynthesis.speak(utterance)
    setStatus('Speaking…')
  }

  return (
    <fieldset>
      <legend>Voice conversation</legend>
      <p>Choose a {['sarah', 'emma'].includes(role) ? 'female' : 'male'} voice for this teammate. Available voices depend on your device.</p>
      <label htmlFor={voiceSelectId}>Voice</label>
      <select id={voiceSelectId} value={voiceId} onChange={event => {
        setVoiceId(event.target.value)
        try { localStorage.setItem('office-voice-' + role, event.target.value) } catch {}
      }}>
        <option value="">Select a voice</option>
        {voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
      </select>
      <button type="button" onClick={speak} disabled={!voiceId}>{text ? 'Hear reply' : 'Preview voice'}</button>
      <button type="button" onClick={() => window.speechSynthesis?.cancel()}>Stop speaking</button>
      {listening
        ? <button type="button" onClick={() => recognition.current?.stop()}>Finish speaking</button>
        : <button type="button" onClick={listen} disabled={disabled}>Use microphone</button>}
      <p>Speech recognition may use your browser’s speech service. Your sent words are saved in the conversation.</p>
      <p role="status">{status}</p>
    </fieldset>
  )
}
