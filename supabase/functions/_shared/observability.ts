import { jsonResponse } from './response.ts'

type EdgeHandler = (req: Request) => Response | Promise<Response>

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,96}$/

function requestId(req: Request) {
  const supplied = req.headers.get('x-request-id')?.trim() ?? ''
  return REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID()
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return { name: 'Error' }
  return {
    name: error.name.slice(0, 80),
    message: error.message
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[id]')
      .slice(0, 320),
  }
}

function attachOperationalHeaders(response: Response, id: string, durationMs: number) {
  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', id)
  headers.set('Server-Timing', `edge;dur=${durationMs.toFixed(1)}`)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function observeEdgeFunction(name: string, handler: EdgeHandler): EdgeHandler {
  return async (req: Request) => {
    const id = requestId(req)
    const startedAt = performance.now()

    try {
      const response = await handler(req)
      const durationMs = performance.now() - startedAt
      const event = {
        type: 'edge_request',
        function_name: name,
        request_id: id,
        method: req.method,
        status: response.status,
        duration_ms: Number(durationMs.toFixed(1)),
      }

      if (response.status >= 500) console.error(JSON.stringify(event))
      else if (response.status >= 400) console.warn(JSON.stringify(event))
      else if (durationMs >= 1500) console.info(JSON.stringify({ ...event, slow: true }))

      return attachOperationalHeaders(response, id, durationMs)
    } catch (error) {
      const durationMs = performance.now() - startedAt
      console.error(JSON.stringify({
        type: 'edge_unhandled_error',
        function_name: name,
        request_id: id,
        method: req.method,
        duration_ms: Number(durationMs.toFixed(1)),
        error: safeError(error),
      }))

      return attachOperationalHeaders(
        jsonResponse({ ok: false, error: 'Terjadi kesalahan server.', request_id: id }, 500),
        id,
        durationMs,
      )
    }
  }
}
