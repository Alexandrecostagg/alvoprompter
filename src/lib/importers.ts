import { fetchRemoteText } from './cloudflare'

export const IMPORTABLE_EXT = '.txt,.md,.markdown,.text,.docx,.pdf'

let workerConfigured = false

export function fileNameFromImport(name: string): string {
  return name.replace(/\.(txt|md|markdown|text|docx|pdf|mp3|wav|ogg|webm|m4a|aac|flac)$/i, '')
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Importe um documento de até 20 MB.')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return extractPdf(file)
  }
  if (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocx(file)
  }
  return file.text()
}

async function extractDocx(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth')
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return (result.value || '').trim()
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const { default: pdfWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    workerConfigured = true
  }
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  try {
    const parts: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) parts.push(text)
    }
    if (!parts.length) {
      throw new Error('Não foi possível extrair texto deste PDF (pode ser escaneado/imagem).')
    }
    return parts.join('\n\n')
  } finally {
    await loadingTask.destroy()
  }
}

function htmlToText(html: string): string {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
  t = t.replace(/<[^>]+>/g, ' ')
  t = t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export async function extractTextFromUrl(rawUrl: string): Promise<string> {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error('Link inválido. Informe uma URL completa (ex.: https://exemplo.com/texto).')
  }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('Use um link público HTTP ou HTTPS, sem credenciais.')
  const isYouTube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname)
  const isGoogleDocs = u.hostname === 'docs.google.com'
  if (isYouTube || isGoogleDocs) {
    const { text } = await fetchRemoteText(rawUrl)
    return text
  }
  try {
    const res = await fetch(u, { mode: 'cors' })
    if (!res.ok) throw new Error(`Falha ao buscar o link (HTTP ${res.status}).`)
    let text = (await res.text()).trim()
    if (!text) throw new Error('O link retornou conteúdo vazio.')
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html') || /^</.test(text)) {
      text = htmlToText(text)
      if (!text) throw new Error('O link não contém texto legível.')
    }
    return text
  } catch (err) {
    const viaWorker = await fetchRemoteText(rawUrl).catch(() => {
      throw new Error(
        `Falha ao buscar o link (${(err as Error).message}). Verifique a conexão com a API (VITE_CLOUDFLARE_API_BASE).`,
      )
    })
    return viaWorker.text
  }
}
