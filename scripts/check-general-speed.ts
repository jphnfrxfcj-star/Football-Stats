/** Compare repeated real server requests across the app. Credentials stay in process environment. */
import handler from '../netlify/functions/api';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Server environment required');
process.env.DEMO_MODE = 'false';
const date = new Date().toISOString().slice(0, 10);
for (const path of [
  'leagues',
  `fixtures?date=${date}`,
  `spotlight?date=${date}`,
  'match/free-fixture-2026-como-vs-parma/analysis',
  'match/free-fixture-2026-como-vs-parma/players',
  `markets?date=${date}&days=8&window=5&minimumRate=80`,
]) {
  const seconds: number[] = [];
  for (let i = 0; i < 2; i++) {
    const t = Date.now();
    const r = await handler(new Request(`http://localhost/api/${path}`), {
      ip: '127.0.0.1',
    } as never);
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    await r.text();
    seconds.push((Date.now() - t) / 1000);
  }
  console.log(JSON.stringify({ path, seconds }));
}
