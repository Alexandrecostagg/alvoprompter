export type StatEvent =
  | 'script_saved'
  | 'record_start'
  | 'record_end'
  | 'video_exported'
  | 'video_shared'
  | 'video_page_created'
  | 'post_published'

const EVENTS_KEY = 'ap.stats.events'
const VIEW_KEY = 'ap.stats.views'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // armazenamento indisponível (modo anônimo): ignora
  }
}

interface EventRecord {
  t: string
  e: StatEvent
  n: number
  secs?: number
}

function events(): EventRecord[] {
  return readJson<EventRecord[]>(EVENTS_KEY, [])
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function trackEvent(event: StatEvent, n = 1, secs?: number): void {
  try {
    const list = events()
    const now = today()
    const last = list[list.length - 1]
    if (last && last.e === event && last.t === now) {
      last.n += n
      if (secs != null) last.secs = (last.secs ?? 0) + secs
    } else {
      list.push({ t: now, e: event, n, secs })
    }
    writeJson(EVENTS_KEY, list)
  } catch {
    // sem localStorage
  }
}

export function recordSeconds(event: StatEvent, seconds: number): void {
  trackEvent(event, 1, seconds)
}

export interface DailyTotals {
  day: string
  scripts: number
  recordings: number
  recordSeconds: number
  exports: number
  shares: number
  pages: number
  published: number
}

export function dailyTotals(days = 14): DailyTotals[] {
  const list = events()
  const out: DailyTotals[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const rec: DailyTotals = {
      day: key,
      scripts: 0,
      recordings: 0,
      recordSeconds: 0,
      exports: 0,
      shares: 0,
      pages: 0,
      published: 0,
    }
    for (const ev of list) {
      if (ev.t !== key) continue
      if (ev.e === 'script_saved') rec.scripts += ev.n
      else if (ev.e === 'record_start') rec.recordings += ev.n
      else if (ev.e === 'record_end') rec.recordSeconds += ev.secs ?? 0
      else if (ev.e === 'video_exported') rec.exports += ev.n
      else if (ev.e === 'video_shared') rec.shares += ev.n
      else if (ev.e === 'video_page_created') rec.pages += ev.n
      else if (ev.e === 'post_published') rec.published += ev.n
    }
    out.push(rec)
  }
  return out
}

export function totals() {
  const daily = dailyTotals(60)
  const sum = daily.reduce(
    (acc, d) => ({
      scripts: acc.scripts + d.scripts,
      recordings: acc.recordings + d.recordings,
      recordSeconds: acc.recordSeconds + d.recordSeconds,
      exports: acc.exports + d.exports,
      shares: acc.shares + d.shares,
      pages: acc.pages + d.pages,
      published: acc.published + d.published,
    }),
    { scripts: 0, recordings: 0, recordSeconds: 0, exports: 0, shares: 0, pages: 0, published: 0 },
  )
  return sum
}

/** Marca uma visualização única por aparelho para uma página de vídeo (id). */
export function trackVideoView(id: string): boolean {
  try {
    const viewed = readJson<Record<string, string>>(VIEW_KEY, {})
    const now = today()
    if (viewed[id] === now) return false
    viewed[id] = now
    writeJson(VIEW_KEY, viewed)
    return true
  } catch {
    return false
  }
}
