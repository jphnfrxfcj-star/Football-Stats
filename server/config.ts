import { ServiceError } from './errors';
export function serverConfig(env: NodeJS.ProcessEnv = process.env) {
  const names = ['API_FOOTBALL_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new ServiceError(
      'SERVER_CONFIG_MISSING',
      `Ontbrekende Netlify Functions-instellingen: ${missing.join(', ')}. Sla ze op voor de productieomgeving en deploy opnieuw.`,
    );
  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL!.trim());
  } catch {
    throw new ServiceError(
      'SUPABASE_URL_INVALID',
      'SUPABASE_URL is geen geldige project-URL. Gebruik https://<project>.supabase.co.',
    );
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/', '/rest/v1', '/rest/v1/'].includes(url.pathname)
  )
    throw new ServiceError(
      'SUPABASE_URL_INVALID',
      'SUPABASE_URL moet de project-URL zijn, zonder API-pad, query of inloggegevens.',
    );
  // The dashboard also exposes /rest/v1 URLs; the SDK adds that path itself.
  return {
    apiKey: env.API_FOOTBALL_KEY!.trim(),
    supabaseUrl: url.origin,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
  };
}
