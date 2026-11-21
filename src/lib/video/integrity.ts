/** Read MP4 sample timing without decoding or loading the whole camera file. */
export interface VideoIntegrity { videoSeconds: number; audioSeconds: number; longestFrameSeconds: number; problem: boolean }
interface Atom { type: string; start: number; end: number }
const kind = (view: DataView, offset: number) => String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, 4))
function atoms(view: DataView, start: number, end: number): Atom[] {
  const result: Atom[] = []
  while (start + 8 <= end) {
    let size = view.getUint32(start)
    const type = kind(view, start + 4)
    let header = 8
    if (size === 1) { if (start + 16 > end) break; size = Number(view.getBigUint64(start + 8)); header = 16 }
    if (size === 0) size = end - start
    if (!Number.isSafeInteger(size) || size < header || start + size > end) break
    result.push({ type, start: start + header, end: start + size })
    start += size
  }
  return result
}
function children(view: DataView, atom: Atom, type: string) { return atoms(view, atom.start, atom.end).filter(a => a.type === type) }

export async function inspectMp4(blob: Blob, signal?: AbortSignal): Promise<VideoIntegrity | null> {
  if (!blob.type.toLowerCase().startsWith('video/mp4')) return null
  let offset = 0
  let moov: Blob | undefined
  while (offset + 8 <= blob.size) {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError')
    const head = new DataView(await blob.slice(offset, offset + 16).arrayBuffer())
    let size = head.getUint32(0)
    const type = kind(head, 4)
    let header = 8
    if (size === 1) { if (head.byteLength < 16) return null; size = Number(head.getBigUint64(8)); header = 16 }
    if (size === 0) size = blob.size - offset
    if (!Number.isSafeInteger(size) || size < header || offset + size > blob.size) return null
    if (type === 'moov') { if (size > 16 * 1024 * 1024) return null; moov = blob.slice(offset + header, offset + size); break }
    offset += size
  }
  if (!moov) return null
  const view = new DataView(await moov.arrayBuffer())
  let videoSeconds = 0, audioSeconds = 0, longestFrameSeconds = 0
  for (const trak of atoms(view, 0, view.byteLength).filter(a => a.type === 'trak')) {
    const mdia = children(view, trak, 'mdia')[0]
    if (!mdia) continue
    const mdhd = children(view, mdia, 'mdhd')[0], hdlr = children(view, mdia, 'hdlr')[0]
    if (!mdhd || !hdlr || hdlr.start + 12 > hdlr.end) continue
    const version = view.getUint8(mdhd.start)
    if (mdhd.start + (version === 1 ? 32 : 20) > mdhd.end) continue
    const scale = view.getUint32(mdhd.start + (version === 1 ? 20 : 12))
    if (!scale) continue
    const duration = version === 1 ? Number(view.getBigUint64(mdhd.start + 24)) : view.getUint32(mdhd.start + 16)
    const handler = kind(view, hdlr.start + 8)
    if (handler === 'soun') audioSeconds = Math.max(audioSeconds, duration / scale)
    if (handler !== 'vide') continue
    const minf = children(view, mdia, 'minf')[0]
    const stbl = minf && children(view, minf, 'stbl')[0]
    const stts = stbl && children(view, stbl, 'stts')[0]
    if (!stts || stts.start + 8 > stts.end) continue
    const count = view.getUint32(stts.start + 4)
    if (!count || stts.start + 8 + count * 8 > stts.end) continue // fragmented/unknown: do not guess
    let ticks = 0, maxDelta = 0
    for (let i = 0; i < count; i++) {
      const p = stts.start + 8 + i * 8
      const n = view.getUint32(p), delta = view.getUint32(p + 4)
      ticks += n * delta
      if (n) maxDelta = Math.max(maxDelta, delta)
    }
    videoSeconds = Math.max(videoSeconds, ticks / scale)
    longestFrameSeconds = Math.max(longestFrameSeconds, maxDelta / scale)
  }
  if (!videoSeconds) return null
  return { videoSeconds, audioSeconds, longestFrameSeconds, problem: audioSeconds - videoSeconds > 2 || longestFrameSeconds > 5 }
}

export const BROKEN_VIDEO_MESSAGE = 'A imagem desta tomada parou antes do áudio ou ficou interrompida. O arquivo original foi preservado, mas é necessário gravar uma nova tomada para recuperar as imagens que faltam.'
