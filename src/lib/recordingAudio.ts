type AudioMode = 'play-and-record' | 'playback'

/** WebKit keeps call-volume routing while microphone capture is active. */
export function setRecordingAudioMode(type: AudioMode): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  // Optional API: a browser without routing control must still be able to record.
  try { session.type = type } catch { /* Use the system's default route. */ }
}
