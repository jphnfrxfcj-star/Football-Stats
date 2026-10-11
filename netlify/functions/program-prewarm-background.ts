import { validRefreshToken } from '../../server/nightly-refresh';
import { programPrewarmEnabled, runProgramPrewarm } from '../../server/program-prewarm';

export default async (request: Request) => {
  if (
    request.method !== 'POST' ||
    !validRefreshToken(
      request.headers.get('authorization'),
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
    )
  ) {
    console.warn('Program preparation invocation rejected');
    return;
  }
  if (!programPrewarmEnabled()) return;
  const report = await runProgramPrewarm();
  console.log('Program preparation complete', report);
};
