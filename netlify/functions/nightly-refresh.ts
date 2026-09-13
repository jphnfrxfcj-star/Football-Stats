import type { Config } from '@netlify/functions';
import { refreshToken, scheduledRefreshHour } from '../../server/nightly-refresh';
/** UTC invokes cover summer/winter; only 23:35 and 07:35 Brussels dispatch work. */
export const config: Config = { schedule: '35 5,6,21,22 * * *' };
export default async () => {
  if (process.env.DEMO_MODE !== 'false' || !scheduledRefreshHour()) return;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error('Server configuration missing for nightly refresh');
  const url = new URL(
    '/.netlify/functions/nightly-refresh-background',
    process.env.URL ?? 'https://matchday-be.netlify.app',
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshToken(secret)}` },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 202) throw new Error(`Nightly dispatch failed (${response.status})`);
  console.log('Nightly football refresh dispatched');
};
