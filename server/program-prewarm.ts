import { serverConfig } from './config';
import { Repository } from './repositories/supabase';
import { MultiLeagueProvider } from './providers/multi-league';
import { ResilientFootballProvider } from './providers/resilient-football';
import { downloadSource } from './providers/free-football';
import { FootballService } from './service';

export function programDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function programPrewarmEnabled(env = process.env) {
  return (
    env.DEMO_MODE === 'false' &&
    env.PROGRAM_PREWARM_ENABLED !== 'false' &&
    (!env.FOOTBALL_PROVIDER || env.FOOTBALL_PROVIDER.trim() === 'free-football')
  );
}

export async function runProgramPrewarm() {
  if (!programPrewarmEnabled()) return { skipped: true };
  const config = serverConfig();
  const repo = new Repository(config.supabaseUrl, config.supabaseKey);
  let service: FootballService;
  const read = (url: string, ttl: number) =>
    service.cached(`free-football:source:v1:${url}`, ttl, () => downloadSource(url));
  const provider = new ResilientFootballProvider(
    config.season,
    new MultiLeagueProvider(config.season, read),
    repo,
    read,
    (key, ttl, loader) => service.cached(key, ttl, loader),
    process.env.FOOTBALL_DATA_ORG_KEY?.trim(),
  );
  service = new FootballService(provider, repo);
  const date = programDate();
  return { date, ...(await service.prepareProgram(date)) };
}
