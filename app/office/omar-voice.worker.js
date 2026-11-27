import { TtsSession } from '@mintplex-labs/piper-tts-web'

let session
self.onmessage = async ({ data }) => {
  try {
    session ??= await TtsSession.create({
      voiceId: 'en_GB-northern_english_male-medium',
      progress: ({ url, loaded, total }) => {
        if (url.endsWith('.onnx') && total) self.postMessage({ progress: Math.round(loaded * 100 / total) })
      },
    })
    const recording = await session.predict(data)
    self.postMessage({ recording })
  } catch {
    self.postMessage({ error: true })
  }
}
