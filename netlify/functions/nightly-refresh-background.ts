import { runNightlyRefresh, validRefreshToken } from '../../server/nightly-refresh';
export default async (request: Request) => {
  if (
    request.method !== 'POST' ||
    !validRefreshToken(
      request.headers.get('authorization'),
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
    )
  ) {
    console.warn('Nightly refresh invocation rejected');
    return;
  }
  const report = await runNightlyRefresh();
  console.log('Nightly football refresh complete', report);
};
