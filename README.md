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

`free-football` is ook de standaard wanneer `FOOTBALL_PROVIDER` ontbreekt. Een bestaande `API_FOOTBALL_KEY` wordt in deze modus niet gebruikt. `FOOTBALL_SEASON` is het seizoenstartjaar: 2026 betekent 2026/27. Zonder deze variabele wordt het huidige seizoen afgeleid. Deze versie ondersteunt de Premier League en La Liga en seizoenstartjaren vanaf 2024; oudere jaren blijven beschikbaar als historie.

3. Deploy branch `main`. `netlify.toml` stelt build `npm run build`, publicatiemap `dist`, Functions en routes in.
4. Open bijvoorbeeld **12 september 2026** en kies een wedstrijd. Op dagen zonder duels in deze competities is een lege lijst normaal; gebruik de datumkiezer of “Volgende dag bekijken”.

De Supabase-URL mag de project-URL of de dashboard-REST-URL met `/rest/v1/` zijn; de server normaliseert die. Gebruik serversleutels uitsluitend in Functions, nooit met een `VITE_`-prefix. De frontend benadert alleen onze API. Supabase RLS staat aan en geeft `anon` en `authenticated` geen tabelrechten. Voor een demo zonder Supabase blijven beide demovariabelen `true`.

## Bronnen en datakwaliteit

- **OpenFootball:** volledige seizoensplanning en beschikbare scores in JSON. Publiek domein. [Project](https://openfootball.github.io/) · [JSON-bestanden](https://github.com/openfootball/football.json).
- **Football-Data.co.uk:** seizoens-CSV's met eind-/rustscores, shots, shots on target, corners, fouls en gele/rode kaarten; een apart bestand bevat komende duels. Periodieke updates, geen livefeed. [Data en toelichting](https://www.football-data.co.uk/data).
- Geen SofaScore-, Flashscore- of LiveScore-scrapers actief. Ontbrekende xG, balbezit, grote kansen, stadion, logo's en events worden niet verzonnen.

Vaste aliases koppelen bijvoorbeeld `Man United` aan `Manchester United FC`. Onbekende namen stoppen de import met `SOURCE_TEAM_UNKNOWN`, zodat namen niet blind worden samengevoegd. Een wedstrijd heeft een stabiele sleutel op basis van **seizoen + thuisteam + uitteam**, geldig voor deze dubbele competities. Een gewijzigde datum creëert geen extra wedstrijd. Voor bekertoernooien is een andere identiteitsstrategie vereist.

Bij overlapping hebben CSV-eindstanden en -statistieken voorrang; de actuele fixtures-CSV actualiseert aftraptijden. Bestaande uitslagen worden niet gewist door een komende-wedstrijdregel. Conflicten over aftrap, eindstand of ruststand blijven zichtbaar in `fixture.provenance.conflicts` en op de analysepagina. Iedere bron heeft een URL en echte ophaaltijd; `provenance.fields` vermeldt welke bron voor elk veld gekozen is. Een gecombineerde score is geen gemiddelde van meerdere websitekopieën.

Engelse bronaftrappen worden vanuit `Europe/London` naar UTC omgezet, inclusief zomer-/wintertijd. Bij ontbrekende tijd staat **Tijd volgt**. De interne datumgrens is dan conservatief 00:00 UTC voor het uitsluiten van dezelfde dag; dit is geen bekende aftraptijd. Het dashboard gebruikt de oorspronkelijke wedstrijddatum. Null blijft null; een werkelijk gerapporteerde nul telt wel mee. Beide aangetroffen OpenFootball-scoreformaten (`{ft: [h,a]}` en `[h,a]`) worden ondersteund.

De historie omvat het gekozen seizoen plus vier eerdere seizoenen van de betreffende competitie, maximaal 60 duels per team en 10 H2H. Voor gepromoveerde teams kan de steekproef kleiner zijn: lagere divisies worden niet geïmporteerd. Updates van de bron kunnen vertraagd zijn; dit product claimt geen livescores. Een ontbrekende of ongeldige bron resulteert in een foutmelding, niet in een verzonnen lege dataset.

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

Een koude matchanalyse leest programma, komende duels en vijf seizoenbestanden voor de betreffende competitie, plus recente ESPN-scoreboards waar uitslagen nog ontbreken. Plan databaseonderhoud voor verlopen cache-/ratelimitrijen en oude sync-logs. Geef bronbestanden geen publiek downloadendpoint met de Supabase service key.

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

### Spelerstatistieken

`GET /api/match/:id/players` verrijkt de laatste vijf beschikbare competitieduels (Premier League of La Liga) van beide teams met ESPN-spelergegevens. De openbare scoreboard- en summary-responses worden server-side gelezen en gecacht; het is een ongedocumenteerde bron zonder beschikbaarheidsgarantie. Bij uitval blijven de bestaande wedstrijdanalyses werken en vermeldt de spelersectie de ontbrekende duels. Er wordt geen blokkade omzeild.

Alleen afgeronde wedstrijden vóór de aftrap tellen mee. Clubs worden via gecontroleerde naamkoppelingen gematcht. Ongebruikte wisselspelers tellen niet als nulobservatie. Schoten, schoten op doel, gemaakte en uitgelokte overtredingen, goals, assists en kaarten hebben elk hun eigen aantal bekende observaties. De UI toont totalen of gemiddelden per optreden, plus het aantal duels en basisplaatsen. Ontbrekende data blijft onbekend. Er zijn geen betrouwbare minuten in deze bron: geen per-90-statistieken, voorspelde opstellingen of player-prop-kansen. Historische spelers kunnen inmiddels vertrokken zijn.

De eerste aanvraag haalt meerdere wedstrijden op en kan circa 10–15 seconden duren. De sectie laadt op verzoek; de wedstrijdanalyse wacht hier niet op. Maximaal twee wedstrijden worden tegelijk opgehaald. Afgeronde spelerobservaties worden 30 dagen gedeeld gecacht, het samengestelde overzicht vijf minuten. ESPN blijft eigenaar van de broninhoud; openbare bereikbaarheid is geen herpublicatielicentie. Bronlinks staan bij de gegevens.

### Spotlight en bookmakerodds

`GET /api/spotlight?date=YYYY-MM-DD` berekent onafhankelijk van de wedstrijdlijst maximaal drie selecties. Alleen komende wedstrijden met bekende aftraptijd en minimaal tien recente duels per team tellen mee. Rangschikking: positief modelvoordeel met recente odds, vervolgens modelkansen met beschikbare bookmakerodds, daarna overige modelkansen. Eén selectie per wedstrijd; dit is geen volledige marktscan of getoetste winststrategie.

De modelquotering is `1 / kans`; het modelvoordeel is `kans × decimale odds − 1`. De eigen kansmodellen zijn niet gekalibreerd op bookmakerprijzen. Het label ‘mogelijke value’ vereist dezelfde teams, datum, aftrap (bij een feed), markt en lijn, plus een quoteringstijdstip van hoogstens vijftien minuten geleden. Oude/onbekende tijden, live of begonnen wedstrijden en onvolledige steekproeven tellen niet als actuele value. Tijdens een geopende pagina verdwijnt het value-label zodra de odds te oud worden. Exchangeprijzen worden uit de optionele feed weggelaten omdat commissie niet wordt gemodelleerd.

`GET /api/match/:id/odds` toont de beschikbare bookmakerprijzen vóór de aftrap. Als aanvullende vergelijking gebruiken de onderdelen zonder extra key `Football-Data.co.uk/fixtures.csv`: periodieke 1X2- en over/under-2.5-odds waar gevuld. Kolommen Max/Avg zijn geen bookmakers en worden niet als concrete aanbiedingen getoond. De oorspronkelijke quoteringstijd is onbekend; ‘opgehaald op’ is alleen ons ophaalmoment. Bronbeschrijving: https://www.football-data.co.uk/notes.txt.

Voor recentere 1X2-odds is [The Odds API](https://the-odds-api.com/sports/epl-odds.html) geïntegreerd:

1. Maak zelf een account/key aan bij https://the-odds-api.com/ en zet `ODDS_API_KEY` als **server-side** omgevingsvariabele in Netlify. Geen `VITE_`-prefix en niet in Git.
2. Kies `ODDS_REGION=eu` (standaard) of `uk`, `us`, `au`. [Bookmakerdekking](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html) verschilt; een Nederlandse of Franse Unibet-feed is geen bevestigde Belgische feed. Napoleon en betFIRST zijn niet bevestigd.
3. `ODDS_CACHE_SECONDS=7200` gebruikt één 1X2-markt en één regio per gedeelde refresh: maximaal ongeveer 372 reguliere refreshes in 31 dagen. Dit past binnen 500 maandcredits zolang er geen ander verbruik of extra retries zijn. Requests worden alleen op bezoekersverzoek uitgevoerd. Het gratis profiel is **geen continue livefeed**: prijzen ouder dan vijftien minuten behouden hun tijdstip maar verliezen het value-label.
4. Voor frequenter verversen kan `ODDS_CACHE_SECONDS=300` worden ingesteld zodra het account voldoende credits heeft. Dat kan circa 8.928 reguliere refreshes per 31 dagen verbruiken. Er wordt geen abonnement afgesloten of quota automatisch verhoogd. Herdeploy na het instellen van de variabelen.

Player-prop-odds en in-playberekeningen zijn nog niet aangesloten; de huidige spelersectie toont historische prestaties. De aanbieder biedt [EPL player-prop-markten](https://the-odds-api.com/sports/epl-odds.html) voor een deel van de bookmakers, maar dekking en afzonderlijke eventrequests moeten eerst op het gekozen account worden bevestigd. In-playodds vergelijken met het bestaande pre-matchmodel zou misleidend zijn.

### Tijdelijke databasefouten

Productiesite: https://matchday-be.netlify.app/.

Gelijktijdige aanvragen voor dezelfde cache-entry delen binnen een serverinstantie één promise. Als een andere instantie de gegevens ophaalt, wacht de aanvraag kort op het resultaat. Publieke browser-GETs proberen tijdelijke database- en synchronisatiefouten maximaal twee keer opnieuw, met respect voor `Retry-After` en annulering bij navigatie. Sleutel-, permissie- en schemafouten worden niet automatisch herhaald.

Supabase-aanvragen hebben één centrale retrylaag; de SDK-retries staan uit om vermenigvuldiging te voorkomen. Veilige reads worden bij netwerk- of gatewayfouten herhaald. Writes/RPCs worden alleen herhaald bij een expliciete rollback of een fout vóór uitvoering, nooit bij een onduidelijke netwerkonderbreking. Bulk-upserts gebruiken een vaste primaire-sleutelvolgorde om [deadlocks te beperken](https://www.postgresql.org/docs/17/explicit-locking.html), zonder de geretourneerde fixturevolgorde te wijzigen.

Logging en het opruimen van cachelocks mogen een correct geladen/gecachet resultaat niet vervangen door een fout; een originele fout blijft eveneens behouden. Netlify-logs bevatten operatie, tabel, HTTP-status en databasecode, zonder sleutels, queryparameters, rijgegevens of ruwe foutmeldingen. Bij een blijvende storing blijft een foutmelding zichtbaar; opnieuw proberen is begrensd.

Bij nieuwe `sb_secret_`-sleutels wordt de sleutel alleen als `apikey` verzonden; een identieke, redundante `Authorization: Bearer`-waarde wordt verwijderd omdat deze sleutel geen JWT is. Echte gebruikers-JWT’s en legacy-sleutels blijven behouden. Zie [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

### Odds en historische combi’s

De homepagina toont een odds-tabel per bookmaker; de wedstrijdanalyse laadt zijn bookmakervergelijking automatisch. `GET /api/markets?date=YYYY-MM-DD&window=5` levert de dagprijzen en onderliggende historische selecties. Vensters zijn 5, 10 of 20. De historie wordt gedeeld gecachet; begonnen wedstrijden worden bij de aanvraag en tijdens weergave uitgesloten.

Een selectie moet in **alle N laatste duels van beide teams** voorkomen. Alleen voltooide duels vóór het evaluatiemoment en de komende aftrap tellen mee, ontdubbeld en ongeacht thuis/uit. Een ontbrekende score of te korte reeks voldoet niet. Onderlinge wedstrijden kunnen in beide reeksen staan; de interface toont beide afzonderlijk met uitslagen. Onderzochte markten: over 0,5/1,5/2,5/3,5, under 2,5, beide teams scoren en eerste helft over 0,5/1,5. Historische 100% is geen voorspelde winstkans.

De combibouwer vermenigvuldigt prijzen bij **dezelfde bookmaker**, met één selectie per wedstrijd, twee tot zes legs en een werkelijk product binnen [2, 3]. De begrensde zoekprocedure toont maximaal drie suggesties, zonder garantie alle mogelijkheden te vinden. Er wordt geen gecombineerde winstkans berekend. Prijzen uit momentopnames blijven indicatief; de boekmaker moet prijs en combinatiemogelijkheid bevestigen.

De gratis CSV bevat geen prijzen voor de meeste lage doellijnen. Een ongeprijsde historische selectie blijft zichtbaar met bewijs, maar wordt niet automatisch geprijsd. Een gebruiker kan bij een opengeklapte selectie zelf een gecontroleerde decimale odd invoeren. Dit vervangt lokaal de prijs voor die selectie en bookmaker, wordt in de combi als **handmatig ingevoerd** gemarkeerd en wordt niet opgeslagen of als feedprijs gepubliceerd. Wissen herstelt de bronprijs. Zonder passende prijzen verschijnt een expliciete lege toestand; criteria worden niet versoepeld om toch een combi te tonen.

### Unibet België en prijsgerichte analyse

De primaire oddsbron is nu de openbare Belgische sportsbookfeed (`ubbe`, `market=BE`) die de [Unibet België sportsite](https://nl.unibetsports.be/betting) gebruikt. Dit is een ongedocumenteerde websitefeed, geen gecontracteerde API. De adapter haalt komende Premier League- en La Liga-wedstrijden binnen acht dagen op (maximaal 24 samen), met drie gelijktijdige eventreads en een gedeelde cache van vijf minuten. Geen login, cookies of accountsleutel vereist. Bij uitval blijven beschikbare vergelijkingsprijzen van de bestaande bron zichtbaar met een melding; ze worden nooit als Belgische Unibet-prijzen gelabeld.

Alleen gecontroleerde criterion-ID’s worden gekoppeld: full-time 1X2, totale goals over 0,5/1,5/2,5/3,5 en under 2,5, BTTS ja. Alleen `NOT_STARTED`-events met toekomstige aftrap en `OPEN`-uitkomsten tellen mee. Kambi-prijs en lijn gebruiken duizendsten. Andere periodes, teamtotalen, DNB en geschorste prijzen worden niet stilzwijgend omgezet. `changedDate` is de laatste prijswijziging, geen ophaaltijd. Event- en outcome-ID’s en de builder-tag blijven behouden; de tag bewijst niet dat willekeurige selecties samen combineerbaar zijn.

De wedstrijdpagina begint met prijs, impliciete kans (`100 / odd`), bestaand model en verschil in procentpunten. Historische frequenties en modelkansen blijven apart. Het verschil is geen gekalibreerd/value-signaal en bevat geen correctie voor bookmakeropslag. Het venster 5/10/20 past de getoonde historie aan; het model behoudt zijn eigen gewogen vensters. Per rij zijn de uitslagen open te klappen.

De betbuilder is een lokaal concept voor twee tot zes markten uit één wedstrijd. Hij evalueert de gekozen voorwaarden gezamenlijk op dezelfde historische duels; onbekende data blijven onbekend. Hij vermenigvuldigt geen marginale kansen of losse odds. De gecombineerde prijs moet voorlopig rechtstreeks bij de bookmaker worden gecontroleerd en handmatig ingevoerd. Selecties wijzigen wist die prijs. Er is geen plaatsing, accountkoppeling of automatische betbuilderprijs. De officiële [Belgische betbuilderpagina](https://nl.unibetsports.be/promotions/sportsbook-promotions/new-bet-builder) beschrijft het product; de prijsservice is nog niet gekoppeld.

`scripts/check-odds.ts` controleert de echte Belgische feed, database en interface op desktop en mobiel, met servercredentials uitsluitend uit procesvariabelen. De datum in deze smoke-test moet naar een beschikbare komende speeldag worden aangepast wanneer die verstreken is.

### Avondverversing, uitslagen en La Liga

`nightly-refresh` staat ingepland om **23:35 en 07:35 Europe/Brussels**. Netlify-cron gebruikt UTC; vier vaste UTC-momenten plus een lokale uurcontrole zorgen ervoor dat per zomer-/wintertijd alleen de twee bedoelde runs worden gestart. De [scheduled function](https://docs.netlify.com/build/functions/scheduled-functions/) verstuurt een getekende serveraanvraag naar `nightly-refresh-background`, die buiten de 30-secondenlimiet kan werken. Geen extra sleutel of database-migratie nodig: de handtekening wordt met een eigen context afgeleid van de bestaande serversleutel. De sleutel zelf wordt niet meegestuurd. `DEMO_MODE=false` is vereist. Alleen gepubliceerde Netlify-deploys activeren het schema.

De worker haalt het huidige seizoen van beide competities rechtstreeks opnieuw op, slaat wedstrijden in batches van 100 op en wist afgeleide wedstrijd-/analyse-/H2H-caches. De broncache wordt bijgewerkt; lokale bronmemoisatie duurt maximaal vijf minuten. Oudere seizoenen blijven volgens hun bestaande broncachebeleid beschikbaar. De job haalt **geen odds voor oude wedstrijden** op. Een lock voorkomt overlap; mislukte competitie-updates worden als fout geregistreerd. De laatste run staat onder `nightly:last-result:v1` in `provider_cache` (aantallen/tijdstip), met aanvullende `provider_sync_log`-regels. In Netlify Functions zijn planning en logs zichtbaar; `Run now` kan een scheduled function handmatig starten, maar de uurcontrole laat buiten de ingestelde lokale uren geen dispatch toe. Een getekende serveraanvraag naar de worker kan de import afzonderlijk verifiëren.

La Liga gebruikt `es.1.json` en CSV-divisie `SP1`, met vijf seizoenen historie en een eigen league-ID. OpenFootball-Spanje publiceert lokale Spaanse tijden (`Europe/Madrid`); Football-Data-CSV gebruikt Britse tijden (`Europe/London`). Identieke wedstrijden houden daardoor dezelfde aftrap en stabiele ID. Spaanse teamaliases zijn expliciet vastgelegd. De Unibet-adapter accepteert de gecontroleerde La Liga-groep `1000095049`; ESPN-spelerverrijking gebruikt `esp.1` en een competitiegebonden scoreboardcache. De legacy `SUPPORTED_LEAGUE_ID` beperkt de gratis gecombineerde provider niet tot één competitie.

Wanneer een recent resultaat nog niet in de periodieke bestanden staat, worden voor maximaal zeven recente kalenderdagen definitieve ESPN-scoreboards gecontroleerd. Alleen volledige eindstanden met gekoppelde teams en passende aftrap tellen mee. Ruststanden worden niet uit de eindstand afgeleid; niet geleverde kaarten/statistieken blijven onbekend. CSV-eindstanden blijven leidend. Reeds opgeslagen eindstanden worden bij bulkimports niet gewist door een onvolledig programmabestand. Latere volledige CSV-correcties worden wel verwerkt.

De homepagina toont een dagrecap van de gefilterde afgelopen wedstrijden. De wedstrijdpagina toont welke 1X2-, goal- en rustvoorwaarden daadwerkelijk uitkwamen, plus beschikbare wedstrijdstatistieken. Dit is een resultaatcontrole, geen claim dat selecties vooraf zijn opgeslagen of winstgevend waren. Oudere/gestarte wedstrijden tonen geen bookmakervergelijking of betbuilder; er worden daarvoor geen browser-oddsaanvragen gestart. Historische modelinschattingen worden expliciet als achteraf gereconstrueerd aangeduid. Als een bron nog geen eindstand levert, verschijnt ‘Uitslag volgt’.

De worker is ook direct uitvoerbaar met `runNightlyRefresh()` uit `server/nightly-refresh.ts` wanneer servervariabelen in de procesomgeving staan. `scripts/check-recap.ts` controleert met echte gegevens beide competities, score-recaps, afwezigheid van oude oddsaanvragen en komende Spaanse Unibet-prijzen op desktop en mobiel. De daarin gekozen datums moeten worden aangepast wanneer de toekomstige testwedstrijd is verstreken.

De jobrapportage telt opgeslagen eindstanden, inclusief behouden resultaten wanneer een bron achterloopt. `recentResultChecksFailed` vermeldt mislukte aanvullende ESPN-controles; `pendingResults` telt geplande wedstrijden waarvan de aftrap meer dan drie uur verstreken is en nog geen eindstand bekend is. Een geslaagde basisimport betekent dus niet dat elke secundaire bron al volledig is bijgewerkt.

### Zichtbare Combi x2–x3

De zelfstandige zoekkaart op de homepagina doorzoekt de gekozen datum en de volgende zeven kalenderdagen, over Premier League en La Liga. Ze blijft zichtbaar wanneer de daglijst leeg is; voor historische datums wordt ze verborgen. Unibet België is standaard geselecteerd. Elke selectie heeft een odd van minimaal 1,10. De kaart zoekt maximaal drie voorstellen met twee tot acht verschillende wedstrijden, prijzen van dezelfde bookmaker en een totale odd tussen 2 en 3. De begrensde zoekprocedure garandeert niet dat alle mogelijkheden worden gevonden.

Standaard moet elke selectie bij beide teams in 100% van de laatste 5, 10 of 20 wedstrijden zijn uitgekomen. De gebruiker kan expliciet 90% of 80% kiezen; de volledige reeks blijft vereist, ontbrekende gegevens worden nooit als geslaagd beschouwd en beide teams moeten afzonderlijk de drempel halen. De kaart toont werkelijke aantallen en onderliggende uitslagen. Zonder passende prijzen verschijnt een lege toestand. Historische frequentie is geen voorspelde winstkans en de bookmaker moet de actuele combinatieprijs bevestigen.

`GET /api/markets` accepteert aanvullend `days=8` en `minRate=80|90|100`; defaults blijven één dag en 100%. De ruwe wedstrijdhistorie wordt gedeeld gecachet tussen vensters en frequentiedrempels. `scripts/check-combo.ts` controleert de echte serverdata en combinaties op desktop en mobiel met credentials uitsluitend uit procesvariabelen.

### Tijdelijke Supabase-tokenweigering

Bij een `sb_secret_`-aanvraag zonder eigen Authorization-JWT herhaalt de server uitsluitend de specifieke 401-fout `PGRST303` / `JWT issued at future`, maximaal twee keer met minstens één en twee seconden wachttijd. Deze authenticatieweigering vindt vóór uitvoering plaats; daardoor mogen ook lock- en rate-limit-RPC's opnieuw worden aangevraagd. Een afgebroken POST met onbekende uitvoeringsstatus wordt nog steeds niet herhaald. Andere JWT-fouten, ongeldige sleutels en ontbrekende permissies behouden hun eigen foutafhandeling.

Als de gerichte herstelpogingen niet helpen, wordt deze fout als tijdelijk geclassificeerd en kan de bestaande browserherhaling herstellen. De app vraagt dan niet ten onrechte om de serversleutel te wijzigen. Dit vangt het [gemelde Supabase-gatewayprobleem](https://github.com/supabase/supabase/issues/49655) op, maar verhelpt de onderliggende infrastructuurstoring niet. Logs bevatten uitsluitend resource, methode, status, foutcode en pogingsnummer; geen sleutel of ruwe foutdetails.

### Spelergegevens vanaf Netlify

De speleradapter gebruikt het openbare `site.web.api.espn.com`-endpoint als eerste bron en `site.api.espn.com` als fallback, met maximaal zes seconden per poging. Bij verificatie gaf het oorspronkelijke endpoint vanaf Netlify HTTP 403, terwijl het webendpoint volledige spelersstatistieken voor Premier League en La Liga leverde. Er worden geen login, cookies of proxy gebruikt. De oorspronkelijke team-/datumcontrole blijft gelden; ontbrekende cijfers blijven onbekend en ongebruikte wisselspelers tellen niet mee.

Scoreboards worden één dag en niet-lege genormaliseerde wedstrijdgegevens dertig dagen gedeeld gecachet. Lege waarnemingen worden niet voor dertig dagen vastgezet. Het samengestelde rapport blijft vijf minuten geldig. Onder ‘Datadekking’ staan afzonderlijke oorzaken voor bronuitval, onverwacht formaat en niet-gekoppelde wedstrijden. Dit is een openbare websitefeed zonder gegarandeerde beschikbaarheid; het rapport toont per team hoeveel van de vijf onderzochte duels werkelijk beschikbaar zijn.
