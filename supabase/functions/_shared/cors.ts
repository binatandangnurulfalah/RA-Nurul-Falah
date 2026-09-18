export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id, server-timing',
}

export function corsPreflight(req: Request) {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null
}
