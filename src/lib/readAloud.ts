/** Preview narration with the device voice. No paid TTS endpoint or AI quota. */
export function readAloud(text: string, callbacks: { onStart: () => void; onEnd: () => void; onError: (message: string) => void }): () => void {
  if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    throw new Error('A leitura em voz alta não está disponível neste aparelho. Tente abrir o app no Safari ou Chrome atualizado.')
  }
  const synth = window.speechSynthesis
  const chunks = text.trim().match(/.{1,240}(?:\s|$)|\S{1,240}/gs) ?? []
  let stopped = false
  let current: SpeechSynthesisUtterance | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    stopped = true
    clearTimeout(watchdog)
    if (current) { current.onstart = null; current.onend = null; current.onerror = null }
    current = null
    synth.cancel()
  }
  const fail = () => {
    stop()
    callbacks.onError('Não foi possível iniciar a voz do aparelho. Confira o volume e a disponibilidade de uma voz em português nos ajustes do dispositivo e tente novamente.')
  }
  const next = () => {
    if (stopped) return
    const chunk = chunks.shift()
    if (!chunk) { stop(); callbacks.onEnd(); return }
    current = new window.SpeechSynthesisUtterance(chunk)
    current.lang = 'pt-BR'
    const voices = synth.getVoices()
    const voice = voices.find((item) => item.lang.replace('_', '-').toLowerCase() === 'pt-br')
      ?? voices.find((item) => item.lang.toLowerCase().startsWith('pt'))
    if (voice) current.voice = voice
    current.onstart = () => { clearTimeout(watchdog); callbacks.onStart() }
    current.onend = () => { clearTimeout(watchdog); next() }
    current.onerror = fail
    watchdog = setTimeout(fail, 8000)
    try { synth.speak(current) } catch { fail() }
  }
  synth.cancel()
  next() // Synchronous: preserves the user's tap required by mobile browsers.
  return stop
}
