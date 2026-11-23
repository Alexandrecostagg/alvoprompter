import { Capacitor } from '@capacitor/core'

export interface NativeReadProgress { loaded: number; total: number; status: number }
const CHUNK_BYTES = 2 * 1024 * 1024
const READ_TIMEOUT = 20_000
const readError = (cause?: unknown) => new Error('O vídeo original está preservado, mas não foi possível abri-lo completamente. Tente recuperar pela Biblioteca.', { cause })

/** Read Capacitor media through bounded ranges, which also return HTTP status on iOS.
 * The iOS handler returns a plain URLResponse for a media request without Range.
 * Never treat a missing HTTP status as proof that a durable native take is empty.
 */
export async function readNativeMovie(
  movie: { uri: string; type: string; bytes?: number },
  onProgress?: (progress: NativeReadProgress) => void,
  chunkBytes = CHUNK_BYTES,
): Promise<Blob> {
  if (typeof movie.uri !== 'string' || !movie.uri.startsWith('file://') || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > CHUNK_BYTES) throw readError()
  const url = Capacitor.convertFileSrc(movie.uri)
  const parts: Blob[] = []
  let loaded = 0, total: number | null = null
  do {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), READ_TIMEOUT)
    let response: Response, part: Blob
    try {
      response = await fetch(url, { headers: { Range: `bytes=${loaded}-${loaded + chunkBytes - 1}` }, signal: controller.signal })
      if (!response.ok && response.status !== 0) throw readError(`HTTP ${response.status}`)
      part = await response.blob()
    } catch (error) { throw readError(error) }
    finally { clearTimeout(timeout) }
    if (!part.size) throw readError()
    const rangeHeader = response.headers?.get('Content-Range')
    if (!rangeHeader && response.status !== 206) {
      // Older/custom handlers can supply a complete body with no HTTP status.
      if (loaded !== 0 || movie.bytes != null && part.size !== movie.bytes) throw readError('Incomplete native response')
      onProgress?.({ loaded: part.size, total: part.size, status: response.status })
      return part.slice(0, part.size, movie.type)
    }
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(rangeHeader ?? '')
    if (!range || Number(range[1]) !== loaded) throw readError(`Invalid Content-Range: ${rangeHeader}`)
    const size = Number(range[3])
    if (!Number.isSafeInteger(size) || size <= 0 || total != null && size !== total || movie.bytes != null && size !== movie.bytes) throw readError()
    total = size
    // Capacitor can report an unclamped last range; check the actual bytes instead.
    if (part.size !== Math.min(chunkBytes, total - loaded)) throw readError()
    parts.push(part); loaded += part.size
    onProgress?.({ loaded, total, status: response.status })
  } while (total != null && loaded < total)
  return new Blob(parts, { type: movie.type })
}
