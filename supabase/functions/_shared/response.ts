import { corsHeaders } from './cors.ts'

export class HttpError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return jsonResponse({ ok: false, error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
  }
  console.error(error)
  return jsonResponse({ ok: false, error: 'Terjadi kesalahan server.' }, 500)
}
