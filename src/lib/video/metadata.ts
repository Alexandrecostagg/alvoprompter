export function readVideoInfo(blob: Blob, signal?: AbortSignal): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(blob)
    let done = false
    const finish = (error?: Error) => {
      if (done) return
      if (!error && (!Number.isFinite(video.duration) || video.duration <= 0)) { video.currentTime = 1e9; return }
      done = true
      const info = { width: video.videoWidth, height: video.videoHeight, duration: video.duration }
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      video.onloadedmetadata = null; video.ondurationchange = null; video.onerror = null
      video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url)
      if (error) reject(error)
      else if (!info.width || !info.height) reject(new Error('Não foi possível conferir o tamanho do vídeo.'))
      else resolve(info)
    }
    const abort = () => finish(new DOMException('Exportação cancelada.', 'AbortError'))
    const timer = window.setTimeout(() => finish(new Error('Não foi possível conferir a duração do vídeo. Tente novamente.')), 15000)
    video.preload = 'metadata'; video.muted = true; video.playsInline = true
    video.onloadedmetadata = () => finish()
    video.ondurationchange = () => { if (Number.isFinite(video.duration) && video.duration > 0) finish() }
    video.onerror = () => finish(new Error('Não foi possível abrir o vídeo preparado.'))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    video.src = url; video.load()
  })
}
