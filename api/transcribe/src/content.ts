export type ContentRole = 'owner' | 'admin' | 'editor' | 'viewer'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
})

export async function workspaceContent(request: Request, db: D1Database, workspaceId: string, collection: string, uid: string, role: ContentRole): Promise<Response> {
  if (!['scripts', 'schedules', 'brandkit'].includes(collection)) return json({ error: 'Coleção inválida.' }, 404)
  if (request.method === 'GET') {
    const rows = await db.prepare('SELECT key, payload, revision, deleted_at AS deletedAt, updated_at AS updatedAt FROM workspace_content WHERE workspace_id = ? AND collection = ? ORDER BY key')
      .bind(workspaceId, collection).all<{ key: string; payload: string; revision: number; deletedAt: string | null; updatedAt: string }>()
    return json({ records: rows.results.map((row) => ({ ...row, payload: JSON.parse(row.payload) })) })
  }
  if (request.method !== 'PUT') return json({ error: 'Método não permitido.' }, 405)
  if (role === 'viewer' || (collection === 'brandkit' && role === 'editor')) return json({ error: 'Seu acesso permite apenas consultar este conteúdo.' }, 403)
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > 512_000) return json({ error: 'Conteúdo muito grande.' }, 413)
  let body: { key?: unknown; payload?: unknown; revision?: unknown; deleted?: unknown }
  try { body = JSON.parse(raw) } catch { return json({ error: 'Conteúdo inválido.' }, 400) }
  if (!body || typeof body !== 'object' || typeof body.key !== 'string' || !/^[\w-]{1,100}$/.test(body.key) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) return json({ error: 'Chave ou revisão inválida.' }, 400)
  const payload = body.payload as Record<string, unknown> | null
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return json({ error: 'Conteúdo inválido.' }, 400)
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === 'string').slice(0,30).map(tag => tag.slice(0,80)) : []
  let sanitized: Record<string, unknown>
  if (collection === 'scripts') {
    if (typeof payload.title !== 'string' || typeof payload.content !== 'string') return json({ error: 'Roteiro inválido.' }, 400)
    sanitized = { title: payload.title.slice(0, 200), content: payload.content, tags, createdAt: Number(payload.createdAt) || Date.now() }
  } else if (collection === 'schedules') {
    if (typeof payload.title !== 'string' || typeof payload.description !== 'string' || !Array.isArray(payload.channels) || !Number.isFinite(payload.scheduledAt)) return json({ error: 'Agendamento inválido.' }, 400)
    sanitized = { title: payload.title.slice(0, 200), description: payload.description, channels: payload.channels.filter((c) => ['youtube', 'instagram', 'tiktok', 'linkedin', 'x', 'whatsapp'].includes(String(c))), scheduledAt: payload.scheduledAt, tags, scriptTitle: typeof payload.scriptTitle === 'string' ? payload.scriptTitle.slice(0,200) : undefined, mediaType: typeof payload.mediaType === 'string' ? payload.mediaType.slice(0,80) : undefined, status: ['scheduled', 'published', 'cancelled', 'failed'].includes(String(payload.status)) ? payload.status : 'scheduled', createdAt: Number(payload.createdAt) || Date.now(), mediaName: typeof payload.mediaName === 'string' ? payload.mediaName : undefined }
  } else {
    if (body.key !== 'brandkit') return json({ error: 'Chave de marca inválida.' }, 400)
    const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#6366f1'
    sanitized = { name: String(payload.name ?? '').slice(0, 80), primaryColor: color(payload.primaryColor), accentColor: color(payload.accentColor), logoDataUrl: typeof payload.logoDataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(payload.logoDataUrl) ? payload.logoDataUrl : undefined }
  }
  const existing = await db.prepare('SELECT revision FROM workspace_content WHERE workspace_id = ? AND collection = ? AND key = ?')
    .bind(workspaceId, collection, body.key).first<{ revision: number }>()
  if ((existing?.revision ?? 0) !== body.revision) return json({ error: 'Este conteúdo mudou em outro aparelho. Sua edição foi mantida neste dispositivo.', conflict: true }, 409)
  const now = new Date().toISOString()
  const nextRevision = Number(body.revision) + 1
  const result = await db.prepare(`INSERT INTO workspace_content (workspace_id, collection, key, payload, revision, deleted_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, collection, key) DO UPDATE SET payload = excluded.payload, revision = excluded.revision,
      deleted_at = excluded.deleted_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    WHERE workspace_content.revision = ?`)
    .bind(workspaceId, collection, body.key, JSON.stringify(sanitized), nextRevision, body.deleted === true ? now : null, now, uid, body.revision).run()
  if (!result.meta.changes) return json({ error: 'Conflito de edição. Sincronize antes de tentar novamente.', conflict: true }, 409)
  return json({ revision: nextRevision, updatedAt: now })
}
