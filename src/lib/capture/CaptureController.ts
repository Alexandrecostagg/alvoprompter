import type { CameraPort, CaptureSnapshot, CapturedMovie, CaptureContext } from './types'

/** Owns one take. Text playback, React renders and filters never own this session. */
export class CaptureController {
  private snapshot: CaptureSnapshot = { phase: 'idle', error: null, warning: null, startedAt: null, movie: null }
  private listeners = new Set<() => void>()
  private generation = 0
  private opening: Promise<void> | null = null
  private starting: Promise<boolean> | null = null
  private finishing: Promise<CapturedMovie | null> | null = null
  private closing: Promise<void> | null = null
  readonly port: CameraPort
  constructor(port: CameraPort) { this.port = port }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<CaptureSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }
  attach = (element: HTMLElement | null) => this.port.attach(element)
  open = (): Promise<void> => {
    if (this.closing) return this.closing.then(() => this.open())
    if (this.opening) return this.opening
    if (['ready', 'starting', 'recording', 'finishing'].includes(this.snapshot.phase)) return Promise.resolve()
    const generation = ++this.generation
    this.publish({ phase: 'opening', error: null, warning: null })
    const operation = (async () => {
      try {
        await this.port.open(reason => {
          if (generation !== this.generation) return
          if (this.snapshot.phase === 'starting') this.publish({ warning: reason })
          else if (this.snapshot.phase === 'recording') { this.publish({ warning: reason }); void this.stop() }
          else if (this.snapshot.phase === 'ready') { this.publish({ phase: 'failed', error: reason }); void this.port.close() }
        })
        if (generation !== this.generation) { await this.port.close(); return }
        this.publish({ phase: 'ready' })
      } catch (error) {
        await this.port.close().catch(() => undefined)
        if (generation === this.generation) this.publish({ phase: 'failed', error: message(error) })
      }
    })().finally(() => { if (this.opening === operation) this.opening = null })
    this.opening = operation
    return operation
  }
  private context: CaptureContext | undefined
  start = (context?: CaptureContext): Promise<boolean> => {
    if (this.snapshot.phase !== 'ready' || this.closing) return Promise.resolve(false)
    const generation = this.generation
    this.context = context
    this.publish({ phase: 'starting', error: null, warning: null, movie: null, startedAt: null })
    const operation = (async () => { try {
      await this.port.start(context)
      if (generation !== this.generation) return false
      this.publish({ phase: 'recording', startedAt: Date.now() })
      if (this.snapshot.warning) { void this.stop(); return false }
      return true
    } catch (error) {
      await this.port.close().catch(() => undefined)
      if (generation === this.generation) this.publish({ phase: 'failed', error: message(error) })
      return false
    } })().finally(() => { if (this.starting === operation) this.starting = null })
    this.starting = operation
    return operation
  }
  stop = (): Promise<CapturedMovie | null> => {
    if (this.finishing) return this.finishing
    if (this.snapshot.phase !== 'recording') return Promise.resolve(this.snapshot.movie)
    this.publish({ phase: 'finishing' })
    const operation = (async () => {
      try {
        const expectedDuration = this.snapshot.startedAt ? (Date.now() - this.snapshot.startedAt) / 1000 : 0
        const movie = { ...await this.port.stop(), context: this.context }
        movie.warning ??= this.snapshot.warning ?? undefined
        if (movie.duration != null && expectedDuration > 3 && movie.duration + 2 < expectedDuration) {
          movie.warning = 'O arquivo ficou mais curto que a gravação. O trecho disponível foi preservado; confira antes de usar e grave uma nova tomada.'
        }
        if (!movie.blob.size) throw new Error('O aparelho não gerou um vídeo. A tomada não foi substituída por outra gravação.')
        await this.port.close()
        this.publish({ phase: 'idle', movie, warning: movie.warning ?? this.snapshot.warning })
        return movie
      } catch (error) {
        await this.port.close().catch(() => undefined)
        this.publish({ phase: 'failed', error: message(error) })
        return null
      }
    })().finally(() => { if (this.finishing === operation) this.finishing = null })
    this.finishing = operation
    return operation
  }
  close = (): Promise<void> => {
    if (this.closing) return this.closing
    const operation = (async () => {
      if (this.starting) await this.starting
      if (this.snapshot.phase === 'recording') await this.stop()
      else if (this.finishing) await this.finishing
      ++this.generation
      await this.port.close()
      // Late permission results are released before a second opening is allowed.
      await this.opening
      if (this.snapshot.phase !== 'failed') this.publish({ phase: 'idle' })
    })().finally(() => { if (this.closing === operation) this.closing = null })
    this.closing = operation
    return operation
  }
}
function message(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir a gravação.' }
