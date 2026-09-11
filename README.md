# Matchday — Football Intelligence

Een responsive voetbalanalyse-MVP met React, Vite, TypeScript, Netlify Functions en Supabase. De eigen, provider-onafhankelijke engine berekent historische frequenties, gewogen scores, trends en uitlegbare modelkansen. Geen externe prediction-endpoints.

## Lokaal starten

Node **22.12+** (Node 22 LTS aanbevolen; `.nvmrc` aanwezig).

```sh
npm ci
cp .env.example .env
npm run dev
```

Open de Vite-URL. De app start standaard in demomodus (ook bij een eerste Netlify-deploy zonder variabelen). Met `VITE_DEMO_MODE=true` werkt de volledige interface zonder accounts. Demo-fixtures en statistieken zijn **synthetisch**, expliciet gemarkeerd en uitsluitend bedoeld om de werking te tonen. Er staan geen echte API-keys in de repository. Voor frontend én Functions: `npm run dev:full`, open `http://localhost:8888`.

```sh
npm test             # engine, normalisatie, API-validatie en cachecoördinatie
npm run build        # strikte TypeScript-check + productie-assets
npm run test:e2e     # browserflows, mobiel, fouten (eerst: npx playwright install chromium)
npm run format:check
```

## Livegegevens en Supabase

1. Maak een Supabase-project en voer `supabase/migrations/001_initial.sql` uit via de SQL editor. Alternatief: link de Supabase CLI en gebruik `supabase db push`.
2. Configureer in `.env`:

```dotenv
VITE_DEMO_MODE=false
DEMO_MODE=false
API_FOOTBALL_KEY=your-server-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-service-role-key
SYNC_SECRET=your-long-random-secret
SUPPORTED_LEAGUE_ID=39
FOOTBALL_SEASON=2026
```

3. Start `npm run dev:full`. Kies een datum binnen het ingestelde seizoen waarop wedstrijden worden gespeeld. Seizoen `2026` betekent seizoenstartjaar; je API-Football-plan moet dat seizoen ondersteunen. De MVP gebruikt één ingestelde competitie, standaard Premier League (39).
4. Open een wedstrijd. De server haalt fixture, teamhistorie en H2H op en berekent de analyse. Bij quota-, configuratie- of providerfouten verschijnt een foutmelding; live-modus schakelt **nooit** stilzwijgend over naar demo.

De frontend heeft geen directe databaseverbinding; `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` zijn daarom niet nodig. Alle tabellen hebben RLS; `anon` en `authenticated` krijgen geen rechten. Alleen de server gebruikt de service role. Geef API-keys **nooit** een `VITE_`-prefix.

## Netlify deployen

1. Push deze projectmap naar je Git-repository en importeer die in Netlify.
2. `netlify.toml` configureert build `npm run build`, publicatiemap `dist`, Functions en SPA/API-routes.
3. Zet `VITE_DEMO_MODE=false` in de **build**-omgeving. Zet `DEMO_MODE=false` en alle servervariabelen hierboven voor **Functions**. Zet geen secrets in `netlify.toml`.
4. Pas eerst het Supabase-schema toe. Deploy en controleer `/api/leagues`, `/api/fixtures?date=YYYY-MM-DD` en een matchanalyse.
5. Voor een openbare demonstratie zonder backendaccounts: zet beide demovariabelen expliciet op `true`.

Deze repository configureert deployment, maar maakt niet automatisch een Netlify-site of Supabase-project aan. Een live-smoketest vereist jouw accounts, keys en databeschikbaarheid.

## Architectuur

```text
src/domain/           Interne modellen, nullability en chronologische selectie
src/analysis/         Zuivere engine, configureerbare gewichten en probability layer
src/demo/             Expliciete synthetische voorbeelddata
src/api.ts            UI-client; serverdetails blijven buiten de frontend
src/components/       Dashboard, matchanalyse en gedeelde UI-componenten
src/App.tsx           Navigatie en modeluitleg
server/providers/     FootballDataProvider + API-Football-normalisatie (Zod)
server/repositories/  Supabase-opslag, identiteitsmapping, cache en locks
server/service.ts     Database-first orchestration en synchronisatie
netlify/functions/    Gevalideerde API, rate limits en beschermde sync
supabase/migrations/  PostgreSQL-schema, RLS en atomaire databasefuncties
tests/                Berekeningen, provider, API en caching
scripts/sync-match.mjs Gecontroleerde historische statistiekensynchronisatie
```

### Nieuwe providers

Implementeer `FootballDataProvider` en normaliseer naar `Fixture`, `Team`, `League` en `TeamMetrics`. De engine importeert geen provider of databasecode. `*_provider_ids` koppelt meerdere externe IDs aan hetzelfde interne ID. De eerste API-Football-import gebruikt deterministische interne IDs; deze IDs zijn voor de engine opaque strings. Leg bij een tweede provider expliciete mappings naar bestaande entiteiten vast **voordat** je importeert. `Repository.resolve`/`saveFixtures` respecteert bestaande mappings. Er is bewust geen onbetrouwbare automatische matching op teamnaam.

Statistieken en events worden per `(fixture_id, provider)` opgeslagen; meerdere providers kunnen dus dezelfde wedstrijd aanvullen. In deze MVP is één provider actief; een toekomstige conflict-/provenance-policy moet expliciet kiezen welke provider per metric voorrang krijgt.

## Analyse en model

- Alleen afgeronde duels **vóór** de te analyseren aftrap; geen datalek uit de toekomst.
- Laatste 5/10/20 en thuis/uitsplits worden afzonderlijk geselecteerd. De live historie is begrensd tot het ingestelde competitieseizoen (maximaal 60 afgeronde duels per team). Aan het seizoensbegin kan de steekproef klein zijn; de UI vermeldt dit. H2H loopt vanaf 2010, maximaal tien duels, ook buiten de huidige competitie.
- Reguliere 90-minutenscores, zonder verlenging of strafschoppen.
- Elke markt rapporteert `successes / total` en percentage. Alleen werkelijk aanwezige vereiste waarden tellen mee. Een ontbrekende ruststand verlaagt alleen de rustmarktsteekproef. Beschikbare eigen goals blijven bruikbaar als de opponent-score ontbreekt.
- `src/analysis/config.ts`: recente 1–5 duels gewicht 1.0; 6–10 gewicht 0.75; 11–20 gewicht 0.45. Relevante thuis/uitduels krijgen ×1.1. H2H krijgt 0.35, ouder dan 730 dagen 0.15. Geen overlappende venstergemiddelden; gedeelde wedstrijden tellen één keer. Bij overlap heeft de tweede teamobservatie voorrang.
- De **gewogen score** gebruikt altijd maximaal 20 duels per team + 10 H2H, onafhankelijk van het geselecteerde UI-venster. Team-goalmarkten zijn gecombineerde frequenties voor de deelnemende teams, geen kans dat beide teams tegelijk die teamdrempel halen.
- Goal probabilities: `(gewogen successen + 1) / (totaal gewicht + 2)`; Beta(1,1)-prior voorkomt onterecht absolute 0/100% bij kleine samples.
- 1/X/2: onafhankelijke Poisson-doelen; λ thuis = geometrisch gemiddelde van gewogen thuisteam-aanval en uitteam-goals-tegen; λ uit analoog. Scoregrid 0–30 goals, genormaliseerd tot 100%; minimaal drie volledige duels per team. Geen competitiesterkte-, bookmaker- of blessurecorrectie.
- Confidence is uitsluitend een **datahoeveelheid-indicator**: <5 onvoldoende, <25 laag, anders gemiddeld. Voor 1/X/2 geldt de kleinste teamsteekproef; goalmarkten gebruiken unieke duels. Dit is geen kalibratiemaatstaf; er wordt geen hoge confidence geclaimd.
- Trends worden uit recente tien duels afgeleid en gerangschikt met frequentie × √steekproef × locatierelevantie × exponentiële recentheidsfactor (365 dagen); H2H krijgt een lagere rangschikkingsfactor.

Modelkansen zijn ongekalibreerde inschattingen, geen zekerheden. Backtesting en kalibratie zijn nodig voordat voorspelprestaties kunnen worden geclaimd.

## Caching en syncstrategie

Alle caches zijn persistent in PostgreSQL; geheugen wordt alleen gebruikt voor gelijktijdige verzoeken in dezelfde Function-instance. Een atomair database-lock voorkomt dubbele fetches tussen instances; een actieve lock resulteert in HTTP 503 met `Retry-After: 5`. Locks verlopen na 90 seconden. Mislukte providerverzoeken worden niet gecachet.

| Resource                                   | Strategie                                                      |
| ------------------------------------------ | -------------------------------------------------------------- |
| Competities                                | 24 uur                                                         |
| Dagprogramma                               | 5 minuten                                                      |
| Actuele fixture                            | 2 minuten; afgeronde opgeslagen fixtures worden lokaal gelezen |
| Teamhistorie                               | 6 uur per team, competitie, seizoen en cutoffdatum             |
| H2H                                        | 24 uur per paar en cutoffdatum                                 |
| Berekende analyse                          | 15 minuten; aparte cache met modelversie                       |
| Gesynchroniseerde historische statistieken | Permanent, per fixture en provider                             |
| Syncpoging zonder beschikbare stats        | Maximaal eens per 24 uur                                       |

Historische goaldata wordt direct opgehaald. Om onverwachte tientallen betaalde providerrequests bij een paginabezoek te vermijden, worden uitgebreide statistieken/events **expliciet vooraf gesynchroniseerd**. Dit kan voor één afgeronde fixture via het beveiligde endpoint, of voor de historische steekproef van een komende wedstrijd:

```sh
# SYNC_SECRET via je shell/secret manager; niet opnemen in frontendcode.
node --env-file=.env scripts/sync-match.mjs http://localhost:8888 af-fixture-123456
```

De syncscript leest maximaal 20 duels per team + 10 H2H, dedupliceert en synchroniseert achtereenvolgens met 13 seconden pauze (onder 5 syncs/minuut). Een miss kost maximaal twee API-Football-calls: statistics + events. Providerdekking, dagelijkse quota en je plan blijven bepalend. Bij fouten stopt het script; opnieuw starten gebruikt reeds opgeslagen stats. Na sync worden analysecaches voor de actieve competitie ongeldig gemaakt. Onbekende stats blijven “Onvoldoende data” totdat zij echt aanwezig zijn. Correcties van al definitief gesynchroniseerde data vereisen een expliciete cache/statistiekreset door een beheerder.

Plan periodiek databaseonderhoud voor verlopen cache-/ratelimitrijen en oude `provider_sync_log`-records. De cachekeys bevatten provider, competitie en seizoen; schaal de retentionstrategie mee met het gebruik.

## API

| Methode | Route                                           | Doel                                                          |
| ------- | ----------------------------------------------- | ------------------------------------------------------------- |
| GET     | `/api/leagues`                                  | Ondersteunde competitie                                       |
| GET     | `/api/fixtures?date=YYYY-MM-DD`                 | Dagprogramma                                                  |
| GET     | `/api/match/:fixtureId`                         | Genormaliseerde fixture                                       |
| GET     | `/api/match/:fixtureId/analysis`                | Brondata, analyse en uitlegbare kansen                        |
| GET     | `/api/match/:fixtureId/h2h`                     | Eerdere ontmoetingen                                          |
| GET     | `/api/team/:teamId/form?before=YYYY-MM-DD`      | Vorm vóór cutoff                                              |
| GET     | `/api/team/:teamId/home-away?before=YYYY-MM-DD` | Thuis/uitsplits                                               |
| POST    | `/api/sync/fixture/:fixtureId`                  | Historische stats/events; `Authorization: Bearer SYNC_SECRET` |

Gebruik de **interne** IDs uit API-responses. Teamendpoints vereisen dat een team al via een fixture is opgeslagen; ze zijn niet beschikbaar in synthetische demomodus. IDs, datums, routes en HTTP-methodes worden gevalideerd. Database-backed rate limits: 60 leesverzoeken/minuut/IP, 5 syncs/minuut/IP en 300 totaal/minuut. IP-adressen worden gehasht opgeslagen. De limieten beschermen de app; API-Football-planquota kunnen lager zijn. Secrets worden niet naar de client gestuurd en foutmeldingen bevatten geen providerresponse of credentials.

## Datadekking en beperkingen

Shots, shots on target, possession, corners, fouls en kaarten komen van `/fixtures/statistics`; xG alleen als `expected_goals` werkelijk aanwezig is. Big chances blijft `null` wanneer de provider dat veld niet levert. Rustgoals komen uit fixture-scores. Events worden bewaard via `/fixtures/events`. Beschikbaarheid verschilt per competitie, seizoen en abonnementsplan; een duurder abonnement garandeert niet iedere metric. Sportmonks, Opta/Stats Perform of StatsBomb kunnen later via dezelfde adaptergrens worden toegevoegd.

Niet inbegrepen: odds, blessures, opstellingen, accounts, abonnementen, live pushupdates, geautomatiseerde seizoensoverschrijdende imports, automatische matching tussen providers, modelbacktests en productie-monitoring. Het MVP is deploybaar, maar live-integratie moet met echte credentials en een gemigreerde database worden geverifieerd.

Bronnen: [API-Football v3-documentatie](https://www.api-football.com/documentation-v3), [officiële API-Football-startgids](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide), [Netlify Functions](https://docs.netlify.com/build/functions/overview/), [Netlify Functions-configuratie](https://docs.netlify.com/build/functions/configuration/).
