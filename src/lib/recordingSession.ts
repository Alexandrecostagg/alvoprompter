export interface RecordingSession {
  result: Promise<Blob>
  stop: () => void
}

/** Wait for the encoder's final dataavailable/stop before releasing its input. */
export function startRecordingSession(stream: MediaStream): RecordingSession {
  if (!stream.getVideoTracks().some((track) => track.readyState === 'live')) {
    throw new Error('A câmera não está pronta. Abra a câmera novamente para gravar.')
  }
  // Let the device choose the H.264 profile; a supported explicit profile can
  // still fail when paired with the camera's actual resolution on iPhone.
  const mime = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
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
      const blob = new Blob(chunks, { type: chunks[0]?.type || recorder.mimeType || mime || 'video/webm' })
      if (error || !blob.size) reject(new Error(error || failure || 'O aparelho não gerou o vídeo. Tente gravar novamente.'))
      else resolve(blob)
    }
  })
  const stop = () => {
    if (stopping || settled) return
    stopping = true
    timeout = setTimeout(() => finish('O aparelho não terminou de salvar o vídeo. Tente gravar novamente.'), 15000)
    if (recorder.state !== 'inactive') {
      try { recorder.stop() } catch { finish('Não foi possível finalizar o vídeo. Tente gravar novamente.') }
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
