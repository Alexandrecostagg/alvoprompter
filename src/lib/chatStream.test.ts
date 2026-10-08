import { describe, expect, it, vi } from 'vitest'
import { readChatStream } from './chatStream'

function stream(chunks: string[]) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
    controller.close()
  } })
}
const content = 'data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n'
describe('chat streaming across providers', () => {
  it('reads split events and final DONE without a trailing newline', async () => {
    const onToken = vi.fn()
    expect(await readChatStream(stream([content.slice(0, 13), content.slice(13), 'data: [DONE]']), onToken)).toBe('Olá')
    expect(onToken).toHaveBeenCalledWith('Olá')
  })
  it('surfaces errors instead of silently accepting partial text', async () => {
    await expect(readChatStream(stream([content, 'data: {"error":{"message":"provider detail"}}\n\n']))).rejects.toThrow('interrompida')
  })
  it('rejects a dropped connection without a completion marker', async () => {
    await expect(readChatStream(stream([content]))).rejects.toThrow('interrompida')
  })
  it('rejects empty responses', async () => {
    await expect(readChatStream(stream(['data: [DONE]\n\n']))).rejects.toThrow('não retornou conteúdo')
  })
  it('surfaces a content refusal', async () => {
    await expect(readChatStream(stream(['data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n']))).rejects.toThrow('Revise o texto')
  })
})
