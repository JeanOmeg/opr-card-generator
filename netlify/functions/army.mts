import type { Config } from '@netlify/functions';
import { loadArmy, RelayError } from '../../api/src/relay';

const PRIMARY_ORIGIN = 'https://jeanomeg.github.io';
const ALLOWED_ORIGINS = new Set<string>([PRIMARY_ORIGIN]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export default async (req: Request): Promise<Response> => {
  const headers = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const id = new URL(req.url).searchParams.get('id') ?? '';

  try {
    const army = await loadArmy(id);
    return Response.json(army, { headers });
  } catch (error) {
    if (error instanceof RelayError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    console.error('Unexpected error loading army:', error);
    return Response.json({ error: 'Could not load this army list.' }, { status: 502, headers });
  }
};

export const config: Config = {
  path: '/army',
};
