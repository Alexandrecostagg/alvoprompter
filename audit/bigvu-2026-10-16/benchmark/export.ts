import { CAPTION_THEMES, renderVideo } from '../../../src/lib/video/render'

const button = document.querySelector<HTMLButtonElement>('#run')!
const result = document.querySelector<HTMLPreElement>('#result')!
const files = document.querySelector<HTMLDivElement>('#files')!
const preview = document.querySelector<HTMLVideoElement>('#preview')!
// Real production export function; fixture media only, no mocked encoder.
button.onclick = async () => {
  button.disabled = true
  const report: Record<string, unknown> = { userAgent: navigator.userAgent, source: 'source.mp4', cases: [] }
  const cases = report.cases as Record<string, unknown>[]
  const show = () => { result.textContent = JSON.stringify(report, null, 2) }
  try {
    const sourceBlob = await (await fetch('./source.mp4')).blob()
    const base = { sourceBlob, targetWidth: 640, targetHeight: 360, crop: { sx: 0, sy: 0, sw: 640, sh: 360 }, captions: [], theme: CAPTION_THEMES.find(t => t.key === 'none')! }
    for (const [name, keepRanges] of [
      ['baseline', [{ start: 0, end: 8 }]],
      ['cut', [{ start: 0, end: 2 }, { start: 4, end: 6 }]],
    ] as const) {
      report.running = name; show()
      const progress: number[] = []
      const start = performance.now()
      const blob = await renderVideo({ ...base, keepRanges: [...keepRanges], onProgress: p => progress.push(p) })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = `${name}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`; link.textContent = `Baixar ${name}`; files.append(link)
      preview.src = url
      cases.push({ name, expectedDuration: keepRanges.reduce((n, r) => n + r.end - r.start, 0), elapsedMs: Math.round(performance.now() - start), bytes: blob.size, type: blob.type, progressMonotonic: progress.every((p, i) => !i || p >= progress[i - 1]!), progressLast: progress.at(-1) })
      show()
    }
    report.running = 'cancel'; show()
    const cancel = new AbortController()
    const started = performance.now()
    const timer = setTimeout(() => cancel.abort(), 1000)
    try {
      await renderVideo({ ...base, keepRanges: [{ start: 0, end: 8 }], signal: cancel.signal })
      cases.push({ name: 'cancel', passed: false, error: 'Export returned after abort' })
    } catch (error) {
      cases.push({ name: 'cancel', passed: (error as Error).name === 'AbortError', errorName: (error as Error).name, elapsedMs: Math.round(performance.now() - started) })
    } finally { clearTimeout(timer) }
    report.running = null; report.completed = true
  } catch (error) { report.error = String(error) }
  finally { show(); button.disabled = false }
}
