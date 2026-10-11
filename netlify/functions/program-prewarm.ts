import type { Config } from '@netlify/functions';
import { refreshToken } from '../../server/nightly-refresh';
import { programPrewarmEnabled } from '../../server/program-prewarm';

/** Keep the current Brussels day ready using existing source TTLs and locks. */
export const config: Config = { schedule: '*/5 * * * *' };
export default async () => {
  if (!programPrewarmEnabled()) return;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error('Server configuration missing for program preparation');
  const url = new URL(
    '/.netlify/functions/program-prewarm-background',
    process.env.URL ?? 'https://matchday-be.netlify.app',
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshToken(secret)}` },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 202)
    throw new Error(`Program preparation dispatch failed (${response.status})`);
};
