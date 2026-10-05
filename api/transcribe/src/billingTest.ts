import api, { type Env } from './index'

/** Isolated billing rehearsal: no media, AI or legacy sync production bindings. */
export default {
  queue: api.queue,
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path !== '/health' && path !== '/account' && !path.startsWith('/account/')
      && !path.startsWith('/billing/') && path !== '/webhooks/asaas') {
      return new Response('Ambiente exclusivo para testes de cobrança.', { status: 404 })
    }
    return api.fetch(request, env, ctx)
  },
}
