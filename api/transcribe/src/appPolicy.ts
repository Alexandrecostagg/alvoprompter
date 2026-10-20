import type { AppPolicy, StorePlatform } from '../../../src/lib/appPolicy'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
export async function readAppPolicy(db: D1Database, platform: StorePlatform): Promise<AppPolicy> {
  return await db.prepare('SELECT platform,minimum_build AS minimumBuild,version,revision FROM app_policy WHERE platform=?').bind(platform).first<AppPolicy>() ?? { platform, minimumBuild: 0, version: '1.6.4', revision: 0 }
}
export async function publicAppPolicy(request: Request, db?: D1Database): Promise<Response> {
  const platform = new URL(request.url).searchParams.get('platform')
  if (platform !== 'ios' && platform !== 'android') return json({ error: 'Plataforma inválida.' }, 400)
  if (!db) return json({ error: 'Verificação temporariamente indisponível.' }, 503)
  return json(await readAppPolicy(db, platform))
}
// Called only after the verified root-admin check in adminRoute.
export async function adminAppPolicy(request: Request, db: D1Database, actorId: string): Promise<Response> {
  if (request.method === 'GET') return json({ policies: await Promise.all((['ios', 'android'] as const).map(p => readAppPolicy(db, p))) })
  if (request.method !== 'PUT') return json({ error: 'Método não permitido.' }, 405)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || (body.platform !== 'ios' && body.platform !== 'android') || !Number.isSafeInteger(body.minimumBuild) || (body.minimumBuild as number) < 0 || (body.minimumBuild as number) > 2147483647 || typeof body.version !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(body.version) || !Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) return json({ error: 'Informe plataforma, versão e build válidos.' }, 400)
  if ((body.minimumBuild as number) > 0 && body.storeAvailable !== true) return json({ error: 'Confirme que esse build já está disponível a todos os usuários na loja desta plataforma.' }, 400)
  const before = await readAppPolicy(db, body.platform)
  if (before.revision !== body.expectedRevision) return json({ error: 'A configuração mudou. Recarregue antes de salvar.' }, 409)
  const after = { platform: body.platform, minimumBuild: body.minimumBuild, version: body.version, revision: before.revision + 1 }
  const id = crypto.randomUUID(), now = new Date().toISOString()
  // Audit is inserted only by the transaction that wins the revision comparison.
  const result = await db.batch([
    db.prepare('INSERT INTO app_policy_audit (id,platform,actor_id,before_json,after_json,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM app_policy WHERE platform=? AND revision=?)').bind(id, body.platform, actorId, JSON.stringify(before), JSON.stringify(after), now, body.platform, before.revision),
    db.prepare('UPDATE app_policy SET minimum_build=?,version=?,revision=revision+1,actor_id=?,updated_at=? WHERE platform=? AND revision=?').bind(body.minimumBuild, body.version, actorId, now, body.platform, before.revision),
  ])
  if (!result[1].meta.changes) return json({ error: 'A configuração mudou. Recarregue antes de salvar.' }, 409)
  return json(after)
}
