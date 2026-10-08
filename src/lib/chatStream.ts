/** Read chat SSE without swallowing provider errors or accepting a truncated answer. */
export async function readChatStream(body: ReadableStream<Uint8Array>, onToken?: (text: string) => void): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let finished = false
  const inspect = (line: string) => {
    if (!line.trim().startsWith('data:')) return
    const data = line.trim().slice(5).trim()
    if (data === '[DONE]') { finished = true; return }
    let event: { error?: unknown; choices?: { delta?: { content?: string; refusal?: string }; finish_reason?: string }[] }
    try { event = JSON.parse(data) } catch { throw new Error('A IA retornou uma resposta inválida. Tente novamente.') }
    if (event.error) throw new Error('A geração foi interrompida. Tente novamente.')
    if (event.choices?.some((choice) => choice.finish_reason === 'content_filter' || choice.delta?.refusal)) {
      throw new Error('A IA não conseguiu atender a este pedido. Revise o texto e tente novamente.')
    }
    const token = event.choices?.[0]?.delta?.content
    if (typeof token === 'string' && token) { full += token; onToken?.(full) }
  }
  try {
    while (!finished) {
      const chunk = await reader.read()
      if (chunk.done) { inspect(buffer + decoder.decode()); break }
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) { inspect(line); if (finished) break }
    }
    if (!finished) throw new Error('A geração foi interrompida. Tente novamente.')
    if (!full) throw new Error('A IA não retornou conteúdo. Tente novamente.')
    return full
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
