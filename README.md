# Matchday — Football Intelligence

Voetbalanalyse met React, Vite, TypeScript, Netlify Functions en Supabase. De standaardprovider combineert **OpenFootball** (programma) en **Football-Data.co.uk** (uitslagen, historie en wedstrijdstatistieken). Hiervoor is **geen betaalde voetbal-API of API-key nodig**. Onze eigen engine berekent frequenties, gewogen scores, trends en transparante modelkansen; geen externe prediction-endpoints.

## Starten

Node 22 LTS, minimaal 22.12. `.nvmrc` aanwezig.

```sh
npm ci
cp .env.example .env
npm run dev
```

De eerste start gebruikt duidelijk gemarkeerde synthetische demodata. Voor frontend én server: `npm run dev:full`, open `http://localhost:8888`.

## Gratis echte gegevens op Netlify

1. Voer `supabase/migrations/001_initial.sql` eenmaal uit in Supabase SQL Editor. Een bestaande installatie hoeft voor de gratis provider **geen nieuwe migratie** uit te voeren: broninformatie wordt in bestaande JSON-kolommen opgeslagen.
2. Zet deze variabelen in Netlify:

```dotenv
# Build scope
VITE_DEMO_MODE=false
# Functions scope, Production context
DEMO_MODE=false
FOOTBALL_PROVIDER=free-football
FOOTBALL_SEASON=2026
SUPPORTED_LEAGUE_ID=39
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-secret-key
SYNC_SECRET=your-long-random-secret
```

`free-football` is ook de standaard wanneer `FOOTBALL_PROVIDER` ontbreekt. Een bestaande `API_FOOTBALL_KEY` wordt in deze modus niet gebruikt. `FOOTBALL_SEASON` is het seizoenstartjaar: 2026 betekent 2026/27. Zonder deze variabele wordt het huidige seizoen afgeleid. Deze versie ondersteunt de Premier League en seizoenstartjaren vanaf 2024; oudere jaren blijven beschikbaar als historie.

3. Deploy branch `main`. `netlify.toml` stelt build `npm run build`, publicatiemap `dist`, Functions en routes in.
4. Open bijvoorbeeld **12 september 2026** en kies een wedstrijd. Op dagen zonder Premier League-duels is een lege lijst normaal; gebruik de datumkiezer of “Volgende dag bekijken”.

De Supabase-URL mag de project-URL of de dashboard-REST-URL met `/rest/v1/` zijn; de server normaliseert die. Gebruik serversleutels uitsluitend in Functions, nooit met een `VITE_`-prefix. De frontend benadert alleen onze API. Supabase RLS staat aan en geeft `anon` en `authenticated` geen tabelrechten. Voor een demo zonder Supabase blijven beide demovariabelen `true`.

## Bronnen en datakwaliteit

- **OpenFootball:** volledige seizoensplanning en beschikbare scores in JSON. Publiek domein. [Project](https://openfootball.github.io/) · [JSON-bestanden](https://github.com/openfootball/football.json).
- **Football-Data.co.uk:** seizoens-CSV's met eind-/rustscores, shots, shots on target, corners, fouls en gele/rode kaarten; een apart bestand bevat komende duels. Periodieke updates, geen livefeed. [Data en toelichting](https://www.football-data.co.uk/data).
- Geen SofaScore-, Flashscore- of LiveScore-scrapers actief. Ontbrekende xG, balbezit, grote kansen, stadion, logo's en events worden niet verzonnen.

Vaste aliases koppelen bijvoorbeeld `Man United` aan `Manchester United FC`. Onbekende namen stoppen de import met `SOURCE_TEAM_UNKNOWN`, zodat namen niet blind worden samengevoegd. Een wedstrijd heeft een stabiele sleutel op basis van **seizoen + thuisteam + uitteam**, geldig voor de dubbele Premier League-competitie. Een gewijzigde datum creëert geen extra wedstrijd. Voor bekertoernooien is een andere identiteitsstrategie vereist.

Bij overlapping hebben CSV-eindstanden en -statistieken voorrang; de actuele fixtures-CSV actualiseert aftraptijden. Bestaande uitslagen worden niet gewist door een komende-wedstrijdregel. Conflicten over aftrap, eindstand of ruststand blijven zichtbaar in `fixture.provenance.conflicts` en op de analysepagina. Iedere bron heeft een URL en echte ophaaltijd; `provenance.fields` vermeldt welke bron voor elk veld gekozen is. Een gecombineerde score is geen gemiddelde van meerdere websitekopieën.

Engelse bronaftrappen worden vanuit `Europe/London` naar UTC omgezet, inclusief zomer-/wintertijd. Bij ontbrekende tijd staat **Tijd volgt**. De interne datumgrens is dan conservatief 00:00 UTC voor het uitsluiten van dezelfde dag; dit is geen bekende aftraptijd. Het dashboard gebruikt de oorspronkelijke wedstrijddatum. Null blijft null; een werkelijk gerapporteerde nul telt wel mee. Beide aangetroffen OpenFootball-scoreformaten (`{ft: [h,a]}` en `[h,a]`) worden ondersteund.

De historie omvat het gekozen seizoen plus vier eerdere Premier League-seizoenen, maximaal 60 duels per team en 10 H2H. Voor gepromoveerde teams kan de steekproef kleiner zijn: lagere divisies worden niet geïmporteerd. Updates van de bron kunnen vertraagd zijn; dit product claimt geen livescores. Een ontbrekende of ongeldige bron resulteert in een foutmelding, niet in een verzonnen lege dataset.

## Caching en opslag

Eerst Supabase controleren; uitsluitend ontbrekende/verlopen data downloaden. Bronbestanden worden als geheel gecachet, zodat niet per team of wedstrijd opnieuw wordt gedownload. Binnen een Function worden gelijktijdige downloads gedeeld; database-locks voorkomen dubbele downloads tussen instances. Een actieve lock geeft HTTP 503 met `Retry-After: 5`; de lock verloopt na 90 seconden.

| Resource                       | Cache                                       |
| ------------------------------ | ------------------------------------------- |
| OpenFootball-programma         | 6 uur                                       |
| Actuele seizoens-CSV           | 6 uur                                       |
| Komende-wedstrijden-CSV        | 1 uur                                       |
| Afgeronde eerdere seizoens-CSV | 30 dagen                                    |
| Dagprogramma API               | 5 minuten                                   |
| Teamhistorie                   | 6 uur                                       |
| H2H                            | 24 uur                                      |
| Analyse                        | 15 minuten, inclusief modelversie in de key |

CSV-statistieken gaan direct mee naar `fixtures`, `fixture_statistics` en `team_match_stats`; geen aparte betaalde statistiekensync nodig. Bronmetadata en veldkeuzes zitten in de bestaande fixture-JSON. Externe IDs blijven in aparte mappingtabellen, met een interne sleutel voor de samengestelde provider en bronverwijzingen naar de afzonderlijke datasets. Oude API-Football-caches blijven geïsoleerd en worden niet met gratis historie gemengd. Reeds definitief opgeslagen fixture-detailrecords worden lokaal gelezen; aangepaste historie wordt bij een nieuwe bronimport bijgewerkt.

De eerste koude matchanalyse leest maximaal zeven bestanden: programma, komende duels en vijf seizoenbestanden. Plan databaseonderhoud voor verlopen cache-/ratelimitrijen en oude sync-logs. Geef bronbestanden geen publiek downloadendpoint met de Supabase service key.

## Eigen analyse-engine

`src/analysis/config.ts` bevat alle modelgewichten. Recente duels 1–5 krijgen 1.0; 6–10 krijgen 0.75; 11–20 krijgen 0.45. Relevante thuis/uitduels krijgen ×1.1. H2H krijgt 0.35; ouder dan 730 dagen 0.15. Gedeelde wedstrijden tellen één keer; de tweede teamobservatie krijgt bij overlap voorrang. De gewogen score gebruikt altijd maximaal 20 duels per team + 10 H2H, onafhankelijk van het gekozen UI-venster.

Iedere markt toont successen / beschikbare duels en een percentage. Alleen wedstrijden vóór de te analyseren aftrap tellen mee. Reguliere speeltijd, geen verlenging of strafschoppen. Ontbrekende rustscores beïnvloeden alleen rustmarkten. Team-goalmarkten zijn gecombineerde teamfrequenties, geen kans dat beide teams tegelijk de drempel halen.

Goal probabilities gebruiken `(gewogen successen + 1) / (totaal gewicht + 2)` met een Beta(1,1)-prior. 1/X/2 gebruikt onafhankelijke Poisson-goals: λ is het geometrisch gemiddelde van gewogen aanval en verdediging, met minimaal drie volledige duels per team. Het scoregrid 0–30 wordt tot 100% genormaliseerd.

Confidence beschrijft de hoeveelheid data: <5 onvoldoende, <25 laag, anders gemiddeld. Dit is geen gemeten voorspelkracht. Trends worden gerangschikt op frequentie × √steekproef × locatierelevantie × exponentiële recentheidsfactor. Het model is niet gebacktest/gekalibreerd en houdt geen rekening met blessures, opstellingen, competitiesterkte of odds.

## API-Football optioneel behouden

Voor een abonnement met voldoende dekking kun je terugschakelen via `FOOTBALL_PROVIDER=api-football` en `API_FOOTBALL_KEY`. Het API-Football-pad behoudt één seizoen historie en afzonderlijke statistiekensync:

```sh
node --env-file=.env scripts/sync-match.mjs http://localhost:8888 af-fixture-123456
```

Dit script gebruikt `SYNC_SECRET`, importeert maximaal 20 duels per team + 10 H2H en pauzeert tussen verzoeken. De gratis provider heeft het niet nodig.

## Architectuur en API

```text
src/domain/            Provider-onafhankelijke modellen en bronvermelding
src/analysis/          Zuivere engine en probability layer
src/components/        Dashboard, matchanalyse en gedeelde UI
server/providers/      Gratis bronadapter, CSV/JSON-normalisatie, API-Football
server/repositories/   Supabase, identiteitsmapping, cache, locks en statistieken
server/service.ts      Import- en analysecoördinatie
netlify/functions/     Gevalideerde API en veilige foutcodes
supabase/migrations/   PostgreSQL-schema en RLS
```

Een nieuwe provider implementeert `FootballDataProvider`. Bestaande mappingtabellen ondersteunen verschillende provider-IDs voor hetzelfde interne ID. De gratis adapter heeft expliciete teamaliases; mapping naar bestaande API-Football-entiteiten wordt niet automatisch gegokt. Oude API-Football-matchlinks moeten bij de gratis provider opnieuw via het dashboard worden geopend.

| Methode | Route                                                                  |
| ------- | ---------------------------------------------------------------------- |
| GET     | `/api/leagues`                                                         |
| GET     | `/api/fixtures?date=YYYY-MM-DD`                                        |
| GET     | `/api/match/:fixtureId`                                                |
| GET     | `/api/match/:fixtureId/analysis`                                       |
| GET     | `/api/match/:fixtureId/h2h`                                            |
| GET     | `/api/team/:teamId/form?before=YYYY-MM-DD`                             |
| GET     | `/api/team/:teamId/home-away?before=YYYY-MM-DD`                        |
| POST    | `/api/sync/fixture/:fixtureId` met `Authorization: Bearer SYNC_SECRET` |

Gebruik interne IDs uit API-responses. Teamendpoints vereisen al geïmporteerde teams. Datum, ID en methode worden gevalideerd. Database-backed limieten: 60 leesverzoeken/minuut/IP, 5 syncs/minuut/IP, 300 totaal/minuut. Sleutels worden nooit in browserfouten opgenomen. Foutcodes onderscheiden configuratie, databaseauthenticatie, ontbrekend schema, onbekende teamnamen en bronproblemen.

## Controles

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
# Echte broncontrole, zonder credentials (doet netwerkverzoeken):
npx tsx scripts/check-free-sources.ts 2026-09-12
```

Met `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` in de shell voert hetzelfde controlescript ook een echte opslag-/analysecontrole uit; dit schrijft wedstrijddata en caches naar die database. Sleutels blijven buiten Git. De browserflows draaien standaard op demodata; de bron-/Supabase-smoketest controleert de echte integratie afzonderlijk.

### Clublogo’s en laadtijd

Clublogo’s worden lokaal uit `public/clubs/` geladen, ook bij eerder gecachte teamgegevens zonder logo. Zie [bron en rechten](public/clubs/CREDITS.md). De afbeeldingen hebben een versie in de bestandsnaam en mogen één jaar in de browsercache blijven. Vervang bij een nieuw logo ook het versienummer.

Succesvolle openbare GET-responses worden 30 seconden in de browser en 60 seconden in Netlify’s gedeelde, duurzame cache bewaard. Alle queryparameters horen bij de cachesleutel, zodat datums en afkapmomenten gescheiden blijven. Fouten, geauthenticeerde verzoeken en synchronisaties krijgen `no-store`. Een synchronisatie kan daardoor maximaal 60 seconden later zichtbaar worden in een reeds gecachte publieke response. Zie [Netlify caching](https://docs.netlify.com/build/caching/caching-overview/).

Bij gratis bronnen worden beide teamhistories en onderlinge duels samen uit de bronbestanden gehaald. Overlappende wedstrijden worden één keer opgeslagen, met behoud van de canonieke database-ID’s. Een eerste analyse kan nog bron- en databasewerk vereisen; daaropvolgende aanvragen profiteren van de bestaande datacache en de CDN-cache.
