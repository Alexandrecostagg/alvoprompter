export interface AccountProfile {
  fullName: string
  phone: string
  organization: string
}

export async function readProfile(db: D1Database, uid: string): Promise<AccountProfile | null> {
  return db.prepare('SELECT full_name AS fullName, phone, organization FROM account_profiles WHERE user_id = ?').bind(uid).first<AccountProfile>()
}

export async function saveProfile(request: Request, db: D1Database, uid: string): Promise<{ profile: AccountProfile } | { error: string }> {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Informe os dados do perfil.' }
  const fields = ['fullName', 'phone', 'organization'] as const
  if (fields.some((key) => typeof body[key] !== 'string')) return { error: 'Informe nome, telefone e organização. Os campos opcionais podem ficar vazios.' }
  const profile: AccountProfile = { fullName: (body.fullName as string).trim(), phone: (body.phone as string).trim(), organization: (body.organization as string).trim() }
  if (profile.fullName.length < 2 || profile.fullName.length > 100) return { error: 'Informe um nome com 2 a 100 caracteres.' }
  if (profile.organization.length > 100) return { error: 'Use até 100 caracteres no nome da organização.' }
  const digits = profile.phone.replace(/\D/g, '')
  if (profile.phone && (profile.phone.length > 30 || !/^\+?[\d\s().-]+$/.test(profile.phone) || digits.length < 8 || digits.length > 15)) return { error: 'Informe um telefone válido com DDD ou deixe o campo vazio.' }
  if (Object.values(profile).some((value) => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) return { error: 'Remova os caracteres inválidos do perfil.' }
  await db.prepare(`INSERT INTO account_profiles (user_id, full_name, phone, organization, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET full_name = excluded.full_name, phone = excluded.phone, organization = excluded.organization, updated_at = excluded.updated_at`)
    .bind(uid, profile.fullName, profile.phone, profile.organization, new Date().toISOString()).run()
  return { profile }
}
