export interface RecordingSession {
  result: Promise<Blob>
  stop: () => void
}

/** Wait for the encoder's final dataavailable/stop before releasing its input. */
export function startRecordingSession(stream: MediaStream): RecordingSession {
  if (!stream.getVideoTracks().some((track) => track.readyState === 'live')) {
    throw new Error('A câmera não está pronta. Abra a câmera novamente para gravar.')
  }
  return startMediaSession(stream, ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'])
}

export function startAudioRecordingSession(stream: MediaStream): RecordingSession {
  if (!stream.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('O microfone não está pronto para gravar o ensaio.')
  return startMediaSession(stream, ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'])
}

function startMediaSession(stream: MediaStream, types: string[]): RecordingSession {
  // Let the device choose the H.264 profile; a supported explicit profile can
  // still fail when paired with the camera's actual resolution on iPhone.
  const mime = types
    .find((type) => MediaRecorder.isTypeSupported(type))
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  let timeout: ReturnType<typeof setTimeout> | undefined
  let stopping = false
  let settled = false
  let failure: string | null = null
  let finish: (error?: string) => void
  const result = new Promise<Blob>((resolve, reject) => {
    finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null
      const blob = new Blob(chunks, { type: chunks[0]?.type || recorder.mimeType || mime || types[types.length - 1] })
      if (error || failure || !blob.size) reject(new Error(error || failure || 'O aparelho não gerou a gravação. Tente gravar novamente.'))
      else resolve(blob)
    }
  })
  const stop = () => {
    if (stopping || settled) return
    stopping = true
    timeout = setTimeout(() => finish('O aparelho não terminou de salvar a gravação. Tente gravar novamente.'), 15000)
    if (recorder.state !== 'inactive') {
      try { recorder.stop() } catch { finish('Não foi possível finalizar a gravação. Tente gravar novamente.') }
    }
  }
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
  recorder.onstop = () => finish()
  recorder.onerror = () => { failure = 'A gravação foi interrompida pelo aparelho. Tente gravar novamente.'; stop() }
  // MP4 on WebKit finalizes reliably as one recording, without periodic fragments.
  if ((recorder.mimeType || mime)?.includes('mp4')) recorder.start()
  else recorder.start(1500)
  return { result, stop }
}
