import { apiBase } from './cloudflare'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface StreamOptions {
  onToken?: (fullText: string) => void
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  signal?: AbortSignal
}

export async function chatStream(messages: ChatMessage[], opts: StreamOptions = {}): Promise<string> {
  const token = await (await import('./auth')).getOptionalIdToken()
  const response = await fetch(`${apiBase()}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      messages,
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: opts.signal,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let message = `Erro na API (${response.status}).`
    try {
      const json = JSON.parse(detail) as { error?: string | { message?: string } }
      const apiMessage = typeof json.error === 'string' ? json.error : json.error?.message
      if (apiMessage) message = apiMessage
    } catch {
      if (detail) message += ` ${detail.slice(0, 200)}`
    }
    throw new Error(message)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Resposta sem corpo. Tente novamente.')

  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const token: string | undefined = json.choices?.[0]?.delta?.content
        if (token) {
          full += token
          opts.onToken?.(full)
        }
      } catch {
        // chunk incompleto ou keep-alive; ignora
      }
    }
  }

  if (!full) throw new Error('A IA não retornou conteúdo. Tente novamente.')
  return full
}

export async function chat(messages: ChatMessage[], opts: StreamOptions = {}): Promise<string> {
  return chatStream(messages, opts)
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Não foi possível interpretar a resposta da IA.')
  }
  return JSON.parse(cleaned.slice(start, end + 1))
}

export interface ScriptGenerationInput {
  topic: string
  format: string
  tone: string
  duration: string
  audience?: string
  notes?: string
}

const DURATION_GUIDANCE: Record<string, string> = {
  '~30 segundos': '65 a 85 palavras',
  '~1 minuto': '125 a 155 palavras',
  '~2 minutos': '250 a 310 palavras',
  '~5 minutos': '625 a 760 palavras',
  '~10 minutos': '1.250 a 1.500 palavras',
}

const FORMAT_GUIDANCE: Record<string, string> = {
  'TikTok / Reels (até 1 min)':
    'Comece direto no conflito, benefício ou curiosidade; não use saudação; crie progressão rápida e finalize com CTA de uma frase.',
  'YouTube Shorts (até 60s)':
    'Entregue o gancho nos primeiros 2 segundos, abra uma curiosidade, desenvolva sem enrolação e feche a promessa antes do CTA.',
  'YouTube (5+ min)':
    'Abra com promessa e contexto, organize a progressão em blocos falados com transições naturais e renove a atenção sem anunciar seções.',
  'Vídeo de vendas':
    'Estruture problema, impacto, mecanismo da solução, benefício e CTA; não invente prova, depoimento, número ou garantia.',
  Vlog: 'Soa pessoal e espontâneo, com observações concretas e transições que pareçam conversa, não redação.',
  'Pregação / Culto':
    'Mantenha tom pastoral e respeitoso; preserve literalmente referências bíblicas fornecidas e não invente citações, capítulos ou versículos.',
  'Curso / Treinamento':
    'Explique uma ideia por vez, antecipe dúvidas e use exemplos concretos sem transformar o texto em lista lida.',
  'Anúncio / Apresentação':
    'Priorize uma promessa verificável, um benefício central e um CTA específico; evite superlativos sem prova.',
  Testemunho:
    'Preserve a voz pessoal e a ordem real dos acontecimentos; não acrescente experiências, resultados ou emoções não fornecidos.',
}

function generationBudget(duration: string): number {
  if (duration.includes('10')) return 3_200
  if (duration.includes('5')) return 1_800
  if (duration.includes('2')) return 900
  return 600
}

export function generateScript(
  input: ScriptGenerationInput,
  opts: StreamOptions = {},
): Promise<string> {
  const system = [
    'Você é o motor de roteiro do AlvoPrompter, especialista em texto falado para câmera e retenção de audiência.',
    'Escreva em português brasileiro natural, como uma pessoa competente realmente falaria — nunca como artigo, redação ou anúncio genérico.',
    'Use frases curtas, uma ideia por frase, pontuação que ajude a respirar e transições fáceis de pronunciar na primeira leitura.',
    'Crie um gancho específico, desenvolva uma linha de raciocínio clara e termine com um CTA coerente com o objetivo.',
    'Evite saudações vazias, clichês corporativos, repetição, excesso de adjetivos, instruções de cena e frases como “no vídeo de hoje”.',
    'Nunca invente estatísticas, pesquisas, testemunhos, resultados, credenciais, preços, citações ou fatos. Quando faltarem dados, escreva sem fabricar prova.',
    'Entregue somente as palavras que o apresentador deve falar. Não use título, cabeçalho, lista, markdown, aspas externas nem comentários.',
  ].join(' ')
  const user = [
    'Crie um roteiro pronto para leitura em teleprompter com base neste briefing:',
    `Formato: ${input.format}`,
    `Tema: ${input.topic}`,
    `Tom: ${input.tone}`,
    `Duração alvo: ${input.duration} (${DURATION_GUIDANCE[input.duration] ?? 'respeite o tempo solicitado'})`,
    `Direção do formato: ${FORMAT_GUIDANCE[input.format] ?? 'adapte a estrutura ao formato informado sem perder naturalidade'}`,
    input.audience ? `Público-alvo: ${input.audience}` : null,
    input.notes ? `Observações e fatos fornecidos pelo usuário: ${input.notes}` : null,
    'Antes de responder, confira silenciosamente: naturalidade oral, duração, fidelidade aos fatos, força do gancho e clareza do CTA.',
  ]
    .filter(Boolean)
    .join('\n')
  return chatStream(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.65, maxTokens: generationBudget(input.duration), ...opts },
  )
}

export type ImproveAction = 'fluencia' | 'encurtar' | 'gancho' | 'tom'

const IMPROVE_PROMPTS: Record<ImproveAction, string> = {
  fluencia:
    'Reescreva para leitura confortável na primeira tentativa: frases curtas, uma ideia por frase, pontuação para respirar, transições faladas e palavras fáceis de pronunciar. Preserve mensagem, fatos, tom e duração aproximada.',
  encurtar:
    'Reduza para aproximadamente metade das palavras. Corte repetição, contexto dispensável e frases fracas, preservando fatos, promessa central, melhor argumento e CTA.',
  gancho:
    'Troque somente as primeiras 2 ou 3 frases por um gancho específico que gere curiosidade ou prometa um benefício verificável. Não use clickbait enganoso e mantenha todo o restante intacto.',
  tom:
    'Ajuste escolha de palavras, ritmo e intensidade ao tom solicitado, mantendo mensagem, fatos, estrutura e duração aproximada.',
}

export function improveScript(
  content: string,
  action: ImproveAction,
  opts: StreamOptions & { toneInstruction?: string } = {},
): Promise<string> {
  const prompt =
    action === 'tom'
      ? `${IMPROVE_PROMPTS.tom}\nInstrução de tom: ${opts.toneInstruction ?? 'mais direto e confiante'}`
      : IMPROVE_PROMPTS[action]
  return chatStream(
    [
      {
        role: 'system',
        content:
          'Você é o editor de roteiro falado do AlvoPrompter. Escreva em português brasileiro natural para leitura diante da câmera. ' +
          'Preserve a intenção e todos os fatos do original; não invente números, provas, citações, resultados ou promessas. ' +
          'Entregue somente o roteiro final, sem título, markdown, diagnóstico, prefácio ou comentário.',
      },
      { role: 'user', content: `${prompt}\n\nRoteiro:\n${content}` },
    ],
    opts,
  )
}

export interface TitlesAndHooks {
  titles: string[]
  hooks: string[]
  hashtags: string[]
}

function uniqueClean(items: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(items)) return []
  return [...new Set(items.map(String).map((item) => item.trim()).filter(Boolean))]
    .map((item) => item.slice(0, maxLength))
    .slice(0, limit)
}

export async function suggestTitlesAndHooks(
  content: string,
  opts: Pick<StreamOptions, 'signal'> = {},
): Promise<TitlesAndHooks> {
  const raw = await chatStream(
    [
      {
        role: 'system',
        content:
          'Você é estrategista de conteúdo do AlvoPrompter, especializado em descoberta e retenção sem clickbait enganoso. ' +
          'Baseie tudo somente no conteúdo do roteiro; não invente números, tendências, resultados ou promessas. ' +
          'Responda em português do Brasil e somente com JSON válido, sem markdown, no formato: ' +
          '{"titulos": ["..."], "ganchos": ["..."], "hashtags": ["..."]}',
      },
      {
        role: 'user',
        content:
          'Crie exatamente 5 títulos distintos de até 70 caracteres, com benefício ou curiosidade específica; ' +
          '5 ganchos distintos de até 15 palavras, faláveis nos primeiros 3 segundos; e ' +
          '12 hashtags relevantes, misturando 3 amplas, 6 de nicho e 3 específicas do tema, todas com # e sem espaços. ' +
          'Evite CAIXA ALTA, promessa falsa, clichê e repetição entre opções. ' +
          'JSON no formato {"titulos": [...], "ganchos": [...], "hashtags": [...]}. Roteiro:\n\n' +
          content.slice(0, 6000),
      },
    ],
    { temperature: 0.75, maxTokens: 1400, jsonMode: true, signal: opts.signal },
  )
  const data = extractJson(raw) as { titulos?: unknown; ganchos?: unknown; hashtags?: unknown }
  const titles = uniqueClean(data.titulos, 5, 70)
  const hooks = uniqueClean(data.ganchos, 5, 140)
  const hashtags = Array.isArray(data.hashtags)
    ? uniqueClean(data.hashtags, 12, 80)
        .map((h) => `#${h.replace(/^#/, '').replace(/\s+/g, '').trim()}`)
        .filter((h) => h.length > 1)
    : []
  if (!titles.length && !hooks.length && !hashtags.length) {
    throw new Error('A IA não retornou sugestões válidas. Tente novamente.')
  }
  return { titles, hooks, hashtags }
}
