export type CapturePhase = 'idle' | 'opening' | 'ready' | 'starting' | 'recording' | 'finishing' | 'failed'
export interface CaptureContext { id: string; scope: string; title: string; scriptKey?: string; scriptContent?: string; createdAt: number }
export interface CaptureValidation { duration: number; videoEnd: number; audioEnd: number; frames: number; largestFrameGap: number; fingerprints: string[]; healthy: boolean }
export interface CapturedMovie { validation?: CaptureValidation; context?: CaptureContext; blob: Blob; warning?: string; duration?: number; nativeFile?: string }
export interface CaptureSnapshot { phase: CapturePhase; error: string | null; warning: string | null; startedAt: number | null; movie: CapturedMovie | null }
export interface CameraPort {
  readonly native: boolean
  attach(element: HTMLElement | null): void
  open(onInterruption: (reason: string) => void): Promise<void>
  start(context?: CaptureContext): Promise<void>
  stop(): Promise<CapturedMovie>
  close(): Promise<void>
}
