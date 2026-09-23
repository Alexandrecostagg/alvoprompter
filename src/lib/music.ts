export interface MusicTrack {
  id: string
  name: string
  emoji: string
  description: string
  bpm: number
  osc: OscillatorType
  filter: number
  detune: number
  groove: 'four' | 'backbeat' | 'soft'
  chords: number[][]
}

const C: number[] = [60, 64, 67, 72]
const G: number[] = [55, 59, 62, 67]
const A: number[] = [57, 60, 64, 72]
const F: number[] = [53, 57, 60, 65]
const E: number[] = [52, 55, 59, 64]

export const MUSIC_LIBRARY: MusicTrack[] = [
  {
    id: 'lofi',
    name: 'Lofi Chill',
    emoji: '🎧',
    description: 'Acordes abertos e groove tranquilo para conteúdo descontraído.',
    bpm: 72,
    osc: 'triangle',
    filter: 1200,
    detune: 0,
    groove: 'backbeat',
    chords: [
      [60, 64, 67, 71],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 67],
    ],
  },
  {
    id: 'upbeat',
    name: 'Energia Upbeat',
    emoji: '⚡',
    description: 'Pop animado com bateria marcada — ideal para cortes e produtos.',
    bpm: 116,
    osc: 'square',
    filter: 2200,
    detune: 6,
    groove: 'four',
    chords: [C, G, A, F],
  },
  {
    id: 'pop',
    name: 'Pop Progressivo',
    emoji: '🎶',
    description: 'Sequência pop brilhante que dá movimento ao vídeo.',
    bpm: 104,
    osc: 'sawtooth',
    filter: 1800,
    detune: 4,
    groove: 'four',
    chords: [F, G, E, A],
  },
  {
    id: 'piano',
    name: 'Piano Suave',
    emoji: '🎹',
    description: 'Arpejos delicados para vídeos emocionais e depoimentos.',
    bpm: 80,
    osc: 'triangle',
    filter: 2600,
    detune: 0,
    groove: 'soft',
    chords: [C, E, F, G],
  },
  {
    id: 'synthwave',
    name: 'Synthwave 80s',
    emoji: '🌆',
    description: 'Sintetizadores com detune e bateria forte, clima retrô.',
    bpm: 90,
    osc: 'sawtooth',
    filter: 1500,
    detune: 12,
    groove: 'four',
    chords: [
      [57, 60, 64, 67, 72],
      [53, 57, 60, 65, 72],
      [60, 64, 67, 72, 76],
      [55, 59, 62, 67, 74],
    ],
  },
]

export const GENERATED_MUSIC_SECONDS = 30

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function scheduleNote(
  ctx: OfflineAudioContext,
  track: MusicTrack,
  midi: number,
  start: number,
  dur: number,
  vel: number,
  bass = false,
) {
  const osc = ctx.createOscillator()
  osc.type = track.osc
  osc.frequency.value = midiToFreq(midi)
  osc.detune.value = bass ? -6 : track.detune
  const gain = ctx.createGain()
  const peak = vel * (bass ? 0.7 : 0.5)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = track.filter
  osc.connect(lp)
  lp.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

function kick(ctx: OfflineAudioContext, start: number, dur: number, vol = 0.5) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, start)
  osc.frequency.exponentialRampToValueAtTime(45, start + dur)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(vol, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

function hat(ctx: OfflineAudioContext, start: number, vol: number) {
  const len = Math.max(1, Math.round(ctx.sampleRate * 0.05))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7000
  const gain = ctx.createGain()
  gain.gain.value = vol
  src.connect(hp)
  hp.connect(gain)
  gain.connect(ctx.destination)
  src.start(start)
}

export async function generateMusicTrack(
  track: MusicTrack,
  seconds = GENERATED_MUSIC_SECONDS,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100)
  const beat = 60 / track.bpm
  const chordBeats = 4
  const chordDur = chordBeats * beat
  let chordIdx = 0

  for (let t = 0; t < seconds; t += chordDur) {
    const chord = track.chords[chordIdx % track.chords.length]!
    chordIdx++
    for (const note of chord) scheduleNote(ctx, track, note, t, chordDur * 0.95, 0.22)
    scheduleNote(ctx, track, chord[0]! - 12, t, chordDur * 0.9, 0.32, true)
    for (let b = 0; b < chordBeats; b++) {
      const bt = t + b * beat
      if (track.groove === 'four' || (track.groove === 'backbeat' && b % 2 === 0)) {
        kick(ctx, bt, beat * 0.85, track.groove === 'four' ? 0.5 : 0.3)
      } else if (track.groove === 'soft' && b % 2 === 0) {
        kick(ctx, bt, beat * 0.85, 0.18)
      }
      if (track.groove !== 'soft' && (b === 1 || b === 3)) hat(ctx, bt, 0.12)
    }
  }
  return ctx.startRendering()
}
