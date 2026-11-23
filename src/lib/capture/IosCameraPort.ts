import { Filesystem } from '@capacitor/filesystem'
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { readNativeMovie } from './readNativeMovie'
import type { CameraPort, CapturedMovie, CaptureContext, CaptureValidation } from './types'

export interface NativeMovie { uri: string; type: string; warning?: string; validation?: CaptureValidation }
interface NativeCamera {
  prepare(): Promise<void>
  setPreview(rect: { x: number; y: number; width: number; height: number; radius: number }): Promise<void>
  start(options: { id: string; context?: CaptureContext }): Promise<void>
  pendingTakes(options: { scope: string }): Promise<{ takes: CaptureContext[] }>
  recoverTake(options: { id: string; scope: string }): Promise<NativeMovie>
  acknowledge(options: { id: string; scope: string }): Promise<void>
  stop(): Promise<NativeMovie>
  release(): Promise<void>
  addListener(event: 'interrupted', callback: (data: { reason: string }) => void): Promise<PluginListenerHandle>
}
export const nativeCamera = registerPlugin<NativeCamera>('AlvoCamera')

export class IosCameraPort implements CameraPort {
  readonly native = true
  private element: HTMLElement | null = null
  private resize: ResizeObserver | null = null
  private listener: PluginListenerHandle | null = null
  private generation = 0
  private scheduled = 0
  private visible = false
  private result: Promise<CapturedMovie> | null = null
  attach(element: HTMLElement | null) {
    this.resize?.disconnect()
    this.element = element
    if (element) { this.resize = new ResizeObserver(this.scheduleLayout); this.resize.observe(element) }
    this.scheduleLayout()
  }
  private scheduleLayout = () => {
    cancelAnimationFrame(this.scheduled)
    this.scheduled = requestAnimationFrame(() => {
      const rect = this.visible ? this.element?.getBoundingClientRect() : undefined
      void nativeCamera.setPreview({ x: rect?.x ?? 0, y: rect?.y ?? 0, width: rect?.width ?? 0, height: rect?.height ?? 0, radius: 0 }).catch(() => undefined)
    })
  }
  async open(onInterruption: (reason: string) => void) {
    const generation = ++this.generation
    const listener = await nativeCamera.addListener('interrupted', event => onInterruption(event.reason))
    if (generation !== this.generation) { await listener.remove(); return }
    this.listener = listener
    await nativeCamera.prepare()
    if (generation !== this.generation) { await nativeCamera.release(); return }
    this.visible = true
    document.documentElement.dataset.nativeCapture = 'true'
    window.addEventListener('resize', this.scheduleLayout)
    window.addEventListener('scroll', this.scheduleLayout, true)
    if (this.element && !this.resize) { this.resize = new ResizeObserver(this.scheduleLayout); this.resize.observe(this.element) }
    this.scheduleLayout()
  }
  async start(context?: CaptureContext) { this.result = null; await nativeCamera.start({ id: context?.id ?? crypto.randomUUID(), context }) }
  stop(): Promise<CapturedMovie> {
    if (this.result) return this.result
    this.result = nativeCamera.stop().then(async result => {
      const { size } = await Filesystem.stat({ path: result.uri })
      const blob = await readNativeMovie({ ...result, bytes: size })
      return { blob, validation: result.validation, warning: result.warning, duration: result.validation?.duration, nativeFile: result.uri }
    })
    return this.result
  }
  async close() {
    ++this.generation
    this.visible = false
    this.resize?.disconnect(); this.resize = null
    delete document.documentElement.dataset.nativeCapture
    cancelAnimationFrame(this.scheduled)
    window.removeEventListener('resize', this.scheduleLayout)
    window.removeEventListener('scroll', this.scheduleLayout, true)
    const listener = this.listener; this.listener = null
    try { await listener?.remove().catch(() => undefined) } finally { await nativeCamera.release() }
  }
}
