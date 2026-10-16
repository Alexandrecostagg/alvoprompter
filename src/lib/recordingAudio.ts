type AudioMode = 'play-and-record' | 'playback'

/** Capture and playback can use distinct system audio-session policies. */
export function setRecordingAudioMode(type: AudioMode): void {
  // Optional API: getter and setter may both be unavailable or rejected.
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = type
  } catch { /* Use the system's default route. */ }
}

/** Reassert the media session when the user starts/resumes a saved video.
 * Does not force speaker over connected headphones or change the user's volume.
 */
export function prepareRecordedPlayback(): void {
  setRecordingAudioMode('playback')
}
