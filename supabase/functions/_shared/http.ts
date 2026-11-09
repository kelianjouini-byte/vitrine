// Utilitaires HTTP communs aux Edge Functions (Deno).
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vitrine-shop',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Enveloppe un handler : CORS, erreurs propres (jamais de secret dans les messages). */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ code: e.code, message: e.message }, e.status);
      console.error('[vitrine] erreur inattendue', e instanceof Error ? e.message : String(e));
      return json({ code: 'internal', message: 'Un problème est survenu. Réessayez dans un instant.' }, 500);
    }
  };
}

export function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  // On retire les espaces / retours à la ligne collés par erreur avec une clé.
  return v && v.trim() ? v.trim() : undefined;
}
