import type { Config } from '@netlify/functions';

export default async (): Promise<Response> => {
  return Response.json({ ok: true });
};

export const config: Config = {
  path: '/health',
};
