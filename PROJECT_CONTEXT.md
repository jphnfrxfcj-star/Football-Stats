# Matchday — projectcontext en AI-overdracht

Laatst inhoudelijk bijgewerkt: 17 september 2026. Dit document beschrijft de
huidige app en de afspraken achter de implementatie. Lees dit eerst in een nieuwe
AI-sessie; inspecteer daarna alleen de relevante code. Oude chatberichten en de
chronologische toevoegingen in README.md kunnen verouderde tussenstappen bevatten.

## Product en werkwijze

Matchday is een voetbalanalysewebapp: de relatie tussen historische statistieken
en bookmakerodds staat centraal. De gebruiker wil een snelle, overzichtelijke app,
met voorkeur voor Unibet België en geen dure verplichte voetbal-API-licentie.

- Repository: https://github.com/jphnfrxfcj-star/Football-Stats.git
- Productie: https://matchday-be.netlify.app/
- Branch: `main`. Pushes naar deze branch starten de Netlify-deploy.
- Gebruikelijke samenwerking: wijzigingen implementeren, passend testen,
  committen en na autorisatie pushen. De gebruiker heeft dit in de lopende sessie
  herhaaldelijk toegestaan. Meld een push niet als geverifieerde live-deploy.
- Communicatie is Nederlands. De interface ondersteunt Nederlands en Engels.
- Bestaande branding: groen/wit, Matchday-activiteitssymbool, lokale clublogo’s,
  sobere geïntegreerde odds. Geen grote groene prijsblokken op de analysepagina.
- De app heeft geen accounts, betalingen of automatische weddenschapplaatsing.

## Routes en schermen

| Route        | Gedrag                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/`          | Dashboard: spotlight, programma met 1/X/2-odds, combizoeker, combihistoriek. Datum-, competitie- en teamfilter.                           |
| `/analyse`   | Wedstrijdkiezer met datum, competitie- en ploegkeuze; opent een echte matchanalyse.                                                       |
| `/match/:id` | Matchanalyse, odds versus statistiek, concept-betbuilder, modelkansen, vorm, goalmarkten, wedstrijd- en spelerstatistieken, H2H en recap. |
| `/combis`    | Apart geladen pagina met maximaal negen compacte combivoorstellen, instelbare doelodds, historische drempel en variatie.                  |

‘Ons model’ opent een uitlegvenster. ‘Matchanalyse’ mag niet hetzelfde modelvenster
openen; op een matchpagina brengt die navigatie je naar boven in de huidige analyse.

Mobiel (tot 720 px): vaste ondernavigatie met labels en safe-area-ruimte, compacte
header met taalkeuze, geen grote promotionele hero/overzichtskaarten, horizontaal
scrollbare spotlightkaarten, aanraakbare filters, uitklapbare combi-uitleg.
Op `/analyse` staan datum, competitie en ploeg mobiel onder elkaar. Keuzelijsten
worden gevuld met wedstrijden op de gekozen datum; de ploegkeuze volgt de competitie.
Een andere competitie wist de ploegkeuze; een andere datum wist beide filters.
Op de oddsvergelijking zijn impliciete kans en modelverschil mobiel optioneel via
‘Toon impliciete kans en modelverschil’. Odds, model en historie blijven direct
beschikbaar. Desktop behoudt de uitgebreidere weergave.

## Stack en belangrijke bestanden

- React 19, TypeScript, Vite; eigen lichte routeafhandeling via History API.
- Netlify Functions voor de API, Supabase voor serveropslag en caching.
- Node 22 LTS, minimaal 22.12; zie `.nvmrc` en `netlify.toml`.
- `src/App.tsx`: navigatie, routes, taalkeuze en modelvenster.
- `src/components/`: de schermen en herbruikbare interface.
- `src/api.ts`, `src/lib/http.ts`: browser-API en begrensde retries.
- `src/analysis/engine.ts`, `probability.ts`, `config.ts`: eigen analysemodel.
- `src/analysis/combinations.ts`: historische kwalificatie en combizoeker.
- `src/analysis/bet-evidence.ts`: bewijs voor markten en gecombineerde voorwaarden
  binnen één wedstrijd.
- `src/analysis/program-prices.ts`: 1/X/2-prijzen uit één bookmaker kiezen.
- `src/domain/combo-history.ts`: onveranderlijke voorstellen en uitkomstbeoordeling.
- `src/components/useComboHistory.ts`: browseropslag van de historiek.
- `server/service.ts`: coördinatie van databronnen, caches en analyses.
- `server/providers/`: gratis voetbalbronnen, ESPN, Unibet en oddsvergelijkingen.
- `server/repositories/supabase.ts`, `memory-cache.ts`: opslag en korte geheugencache.
- `netlify/functions/api.ts`: gevalideerde API-grens.
- `server/nightly-refresh.ts`, `netlify/functions/nightly-*.ts`: geplande updates.
- `src/i18n/`: vaste Engelse vertalingen en taalvoorkeur; geen vertaaldienst.

## Competities en bronnen

De gratis multiprovider ondersteunt vier competities, centraal gedefinieerd in
`src/domain/competitions.ts`:

| Divisie | Competitie     | ESPN-code | Legacy API-ID |
| ------- | -------------- | --------- | ------------- |
| E0      | Premier League | eng.1     | 39            |
| SP1     | La Liga        | esp.1     | 140           |
| I1      | Serie A        | ita.1     | 135           |
| F1      | Ligue 1        | fra.1     | 61            |

- **OpenFootball**: seizoensprogramma’s en beschikbare uitslagen.
- **Football-Data.co.uk**: CSV met eindstanden, ruststanden, historie,
  wedstrijdstatistieken en periodieke bookmakerprijzen.
- **Football-data.org**: onafhankelijke terugval voor programma en uitslagen van
  onze vier competities. Servervariabele `FOOTBALL_DATA_ORG_KEY`; nooit `VITE_`.
  Huidig seizoen 15 minuten gecachet, vorig seizoen één dag; gedeeld maximum
  negen aanvragen per minuut. Geen bookmakerodds of verzonnen wedstrijdstatistieken.
- **ESPN**: aanvullende uitslagen en spelerstatistieken. Primaire host
  `site.web.api.espn.com`; `site.api.espn.com` is fallback en kan vanaf Netlify 403 geven.
- **Unibet België / openbare Kambi-feed**: beschikbare pre-matchodds, gekoppeld aan
  gecontroleerde competitie-, team- en aftrapgegevens.
- Een optionele The Odds API-feed bestaat; een betaalde sleutel is niet vereist
  voor de standaardwerking. API-Football is een legacy optionele provider.
- Er zijn **geen actieve SofaScore-, Flashscore- of LiveScore-scrapers**.

Gebruik vaste, gecontroleerde clubaliases; onbekende clubs niet blind samenvoegen.
Fixture-identiteit bij de huidige dubbele competities is seizoen + thuisteam +
uitteam. Een uitgestelde aftrap mag geen nieuwe fixture creëren. Dit is niet zonder
meer bruikbaar voor bekers of meerdere ontmoetingen met dezelfde thuis/uitcombinatie.

## Datakwaliteit en modelregels

- `null` betekent onbekend, niet nul. Een echte gerapporteerde nul telt wel mee.
- Geen verzonnen uitslagen, odds, spelers, minuten of statistieken bij bronuitval.
- Gebruik alleen historie van vóór de betreffende aftrap en voorkom dat toekomstige
  waarnemingen historische kwalificatie verbeteren.
- Historie kan maximaal vijf competitieseizoenen omvatten. Promovendi hebben soms
  minder data; lagere divisies worden niet automatisch toegevoegd.
- CSV-uitslagen/statistieken krijgen voorrang bij bronconflicten. Provenance en
  conflicten blijven inspecteerbaar. Aftrappen worden correct naar UTC omgerekend.
- Onbekende aftraptijd is geen geldige pre-matchselectie.
- Modelkansen zijn eigen, ongekalibreerde schattingen. Goalmarkten gebruiken gewogen
  frequenties/Beta-prior; 1/X/2 gebruikt een Poisson-model. Geen externe predictions.
  Modelversie 1.1.0: aanvullende H2H-duels wegen maximaal 0,35 en halveren continu
  elke 365 dagen; gedeelde wedstrijden tellen één keer met hun hoogste relevante gewicht.
  Recente teamvorm blijft zwaarder: duels 1–5 gewicht 1, 6–10 0,75, 11–20 0,45;
  relevante thuis/uitpositie ×1,1. Transfers/blessures/opstellingen zijn geen modelinvoer.
- Historische frequentie is **niet** de voorspelde slaagkans van een selectie of combi.
- Modelvoordeel wordt alleen met voldoende recente, geschikte odds berekend;
  momentopnames met onbekend tijdstip worden niet als actuele value gepresenteerd.

## Odds: belangrijk bij bugs en uitbreidingen

Programma en spotlight vragen odds gericht voor hun wedstrijden op. Gebruik daar
niet opnieuw alleen de algemene feed: die selecteert maximaal 24 wedstrijden voor
de komende acht dagen, waardoor een gekozen speeldag buiten de selectie kan vallen.
Matchanalyse vraagt specifiek de geopende wedstrijd op. Lijst- en eventcaches
worden gedeeld tussen deze aanvragen.

De combizoeker vraagt odds gericht op voor alle nog komende wedstrijden uit de
gekozen periode, eveneens buiten de algemene limiet van 24 wedstrijden. Hij toont
de bronmelding bij de resultaten, ook bij gedeeltelijke of volledige bronuitval.

- Programma toont compacte 1/X/2-prijzen, zonder prijstegels, onder de teams.
- Gebruik één bookmaker per wedstrijdregel; geen mix van prijzen tussen bookmakers.
  Een volledige reeks heeft voorrang op een onvolledige; bij gelijke dekking heeft
  Unibet voorkeur. Een alternatief moet zichtbaar bij naam staan.
- Geen bookmakerodds op afgelopen wedstrijden; toon uitslagen/recap.
- De spotlight kan een andere markt tonen dan 1/X/2. Beschikbare programmaodds
  bewijzen dus niet dat de specifieke spotlightmarkt beschikbaar is.
- Dashboard heeft een herlaadknop en één automatische herkansing na circa 65 seconden
  bij ontbrekende prijzen, rekening houdend met de korte CDN-cache.
- Spotlight en matchodds hebben ook een herlaadmogelijkheid.
- Unibet kan vanaf Netlify tijdelijk onbereikbaar zijn. Geen garantie op volledige
  of live odds; een lege bron mag niet worden vervangen door fictieve prijzen.
- CSV-odds zijn momentopnames, geen bevestigde actuele bookmakerdeals.

## Uitval en alternatieve gegevens

Sinds 17 september 2026 kan Football-Data.co.uk naar localhost doorverwijzen.
De downloader volgt alleen HTTPS-redirects binnen hetzelfde brondomein (www mag
wijzigen). Een omleiding naar localhost wordt vóór de vervolgaanvraag geweigerd.

- `ResilientFootballProvider` probeert de bestaande multiprovider eerst. Alleen
  bronuitval of een bezette broncache activeert de terugval; database-autorisatie-
  en configuratiefouten blijven fouten. Na uitval één minuut geen nieuwe primaire poging.
- Programma: Football-data.org → zelfstandig OpenFootball → eerder opgeslagen
  fixtures, maximaal zeven dagen oud. Alle getoonde terugvalgegevens hebben
  `availability` met bron en oorspronkelijke update-tijd. Geen bron en geen
  bruikbare opslag geeft een fout, geen schijnbaar lege wedstrijdlijst.
- Analyse: huidig en vorig seizoen van Football-data.org, aangevuld met opgeslagen
  statistieken uitsluitend bij overeenkomende eindstanden. Automatische voorstellen
  gebruiken alleen de twee opgehaalde seizoenen wanneer eerdere wedstrijden van
  beide teams een bevestigde uitslag hebben (of geannuleerd/uitgesteld zijn).
  Ontbrekende ruststanden blijven null en kwalificeren niet voor rustmarkten.
- Kan deze historie niet volledig worden bevestigd, dan toont de analyse beschikbare
  uitslagen en opgeslagen historie als `partial`. Combibuilder en spotlight sluiten
  die data uit, ook bij een lagere historische drempel. De interface legt dit uit.
  Onvoldoende steekproeven blijven onder de bestaande selectievoorwaarden vallen.
- Opgeslagen fixtures worden nooit opnieuw opgeslagen met een kunstmatig nieuwe
  waarnemingstijd. Ontbrekende statistieken/ruststanden wissen bekende gegevens
  niet wanneer de bevestigde eindstand gelijk blijft.
- Dezelfde terugval geldt bij de nachtelijke programma-update; de rapportage telt
  `fallbackFixtures`. Namespace multiprovider `v3`, compacte combihistorie `v5`;
  de compacte cache bewaart ook beschikbaarheidsstatus, waarschuwingen en tijdstip.
- Bronmeldingen verschijnen bij programma, wedstrijdkiezer, analyse, spotlight en
  combivoorstellen, in Nederlands en Engels. Echte odds blijven onafhankelijk nodig.

## Twee verschillende builders

### Combi van verschillende wedstrijden

`ComboFinder` en `suggestCombinations` combineren uitsluitend echte beschikbare
prijzen bij dezelfde bookmaker:

- 2 tot maximaal 8 wedstrijden; **elke ploeg maximaal één keer in dezelfde combi**,
  ook over meerdere dagen en ongeacht thuis/uit. Rayo–Espanyol en Elche–Espanyol
  mogen bijvoorbeeld niet samen op hetzelfde voorstel.
- Elke individuele odd minimaal 1,10.
- Homepage: doelodd 2–3, maximaal 3 voorstellen, historie 5/10/20 wedstrijden,
  drempelkeuze 80/90/100% per team; standaard 100%.
- Aparte combipagina: doelbereik instelbaar tussen 2 en 20; maximaal 9 voorstellen;
  historische drempels 50/60/70/80/90/100%.
- Elke selectie moet de drempel halen voor **beide teams**, met een volledige
  waargenomen steekproef. Ontbrekende waarnemingen kwalificeren niet als succes.
- Homepage blijft een eenvoudige historische x2–3-zoeker: geen beoordelingselector
  of verplichte prijsfilter. De ingestelde historische eisen blijven ongewijzigd.
- Combipagina start met **Toon voorstellen met beoordeling**. Alle historisch
  passende selecties met bruikbare odds blijven beschikbaar. Voorstellen worden
  gerangschikt op hun zwakste prijsbeoordeling: beide modellen boven break-even,
  tegenstrijdig, beide eronder, of niet beoordeelbaar. Dit is diagnostische
  rangschikking, geen bewezen betere bettingstrategie. Waarschuwing op elke kaart.
- Expliciete optie **Alleen ruime modelmarge (experimenteel)** behoudt de strenge
  filter: minstens 20 waargenomen marktuitslagen per ploeg, minstens 5 relevante
  thuis-/uitduels en beide modellen ≥5 procentpunten boven `100 / odd`.
  Geen verplichte H2H-steekproef; geen versoepeling bij hogere doelodds/variatie.
- Actuele prijsbeoordeling vraagt een feedprijs die maximaal 15 minuten geleden is
  waargenomen (`observedAt`), of anders gewijzigd (`updatedAt`). Cachehits verversen
  deze tijd nooit. Onbekende/verlopen/snapshotprijzen krijgen geen actuele marge.
- De uitgebreide pagina toont aantallen per beoordeling, afwijzingsredenen en
  maximaal twaalf afzonderlijke kandidaten, ook als geen combi mogelijk is.
  Bij de experimentele filter staat hoeveel verschillende wedstrijden overblijven.
  Geen samengestelde combiwinstkans. Historie en voorspelling blijven onderscheiden.
- `combo-assessment.ts`: gewogen frequentie/Beta-prior en Poisson met gewogen
  aanval/verdediging, inclusief rustmarkten. Laatste 10, trend 5 tegenover vorige 5,
  thuis/uit en gedateerde H2H inspecteerbaar. Geen nieuwe geleerde parameters.
- Onderzoek: `docs/combo-model-review.md` (eerste audit) en
  `docs/combo-policy-review.md` (huidige productkeuze en nieuwe eindtest 2025/26).
  De extra eindtest omvat 1.347 wedstrijden naast de oorspronkelijke 2.565.
  Minimumregel en sigmoidkalibratie tonen geen brede overtuigende winst boven de
  eenvoudige competitiebaseline. Geen bewijs van winstgevendheid van de prijsfilter.
- Ondersteunde markten: over 0.5/1.5/2.5/3.5, under 2.5, BTTS en eerste helft over
  0.5/1.5. Corners, kaarten en spelersmarkten zitten niet in deze combizoeker.
- ‘Meer variatie’ beloont verschillende markten en minder herhaalde selecties tussen
  voorstellen. Het verandert de historische eisen niet en belooft geen hogere kans.
- De nieuwste prijs wordt vóór de modelcontrole gekozen; geen oudere gunstige prijs
  selecteren omdat de nieuwste afvalt. De zoekboom onderzoekt ook uitbreidingen van
  al geldige combinaties binnen de doelodds, tot de bestaande limieten.
- Het zoeken is begrensd op 50.000 bezochte combinatiestappen. Geen resultaat is
  geen wiskundig bewijs dat geen enkele combinatie mogelijk is.
- Data laden start pas na ‘Doe een voorstel’. Doelodds/rangschikking aanpassen
  gebruikt bestaande data; de historische drempel of het venster wijzigen kan
  een nieuwe API-aanvraag doen. Geen extra providerfetch per weergegeven voorstel.

### Betbuilder binnen één wedstrijd

`BetWorkbench` laat 2–6 markten uit dezelfde wedstrijd kiezen. Het toont gezamenlijke
historische waarnemingen. **Vermenigvuldig die losse odds niet**: overlappende
markten zijn afhankelijk. De echte gecombineerde prijs en beschikbaarheid moeten
bij de bookmaker worden bevestigd; een handmatig ingevoerde prijs is expliciet gelabeld.

## Combihistoriek

- Getoonde echte voorstellen worden vóór de aftrap automatisch lokaal opgeslagen.
- Browserkey: `matchday:combo-history:v1`; demo gebruikt een aparte suffix `:demo`.
  Demovoorstellen worden niet automatisch opgeslagen.
- Geen Supabase-historiektabel en geen synchronisatie tussen apparaten/accounts.
- Maximaal 200 voorstellen; bij een volle of onleesbare opslag volgt een melding.
  Bestaande data niet stilzwijgend wissen of overschrijven.
- Eerste snapshot blijft vast: bookmaker, individuele odds, aftrappen, markt,
  historische hits, venster, drempel en opslagtijd. Nieuwe snapshots bewaren ook
  beoordelingswijze (`history`/`review`/`strict`), modelversie, modelscores, controlemarge/status en eventuele
  prijsobservatietijd. Deze velden zijn optioneel; oude historie blijft leesbaar.
  Deduplicatie per bookmaker en
  verzameling fixture/marktselecties, niet op later gewijzigde prijzen.
- Uitslagen laden alleen bij openen/verversen van de historiek, in batches via
  `/api/results?ids=...` (maximaal 50 IDs per aanvraag), zonder zware analysefetch.
- Status: open, uitgekomen, niet uitgekomen, niet te beoordelen. Ontbrekende of
  geannuleerde resultaten zijn geen automatisch verlies. Rustmarkten vragen een
  bekende ruststand. Eén verloren leg maakt de combi verloren; alle gewonnen is gewonnen.
- JSON-export en verwijderen per voorstel beschikbaar. Geen ROI-/winstclaim en
  geen reconstructie van tips die vóór invoering nooit opgeslagen zijn.

## Spelers

Spelerdata wordt pas na ‘Spelers bekijken’ geladen. De rapportage gebruikt de laatste
vijf teamduels vóór aftrap. Alleen bevestigde optredens tellen mee; ongebruikte
wisselspelers niet. Minuten zijn niet voldoende beschikbaar, dus presenteer geen
per-90-statistieken. Shots, shots on target, fouls, assists/kaarten zijn afhankelijk
van daadwerkelijke brondekking. Benoem ontbrekende wedstrijden en dekking.

## Opslag, performance en updates

- Supabase-migratie: `supabase/migrations/001_initial.sql`. De fixture bevat een
  `data` JSON-kolom met scores/statistieken; scores zijn niet losse SQL-scorekolommen.
- Browser benadert uitsluitend `/api`, nooit Supabase met een serversleutel.
- Gedeelde broncaches, in-flight-deduplicatie en database-locks beperken dubbele
  downloads. Een drukke lock geeft een tijdelijke fout met retry-instructies.
- Geheugencache per repository: maximaal 30 seconden, begrensd op aantallen/bytes,
  nooit langer dan de echte DB-expiry; fouten en ontbrekende (`null`) resultaten worden niet als cachehit bewaard.
- Verlopen cachepayloads worden al in de DB-query uitgesloten.
- Meerdaagse combihistorie wordt compact opgeslagen: gedeelde fixtures eenmaal,
  laatste 20 per ploeg plus maximaal 10 relevante thuis-/uitduels en 10 H2H,
  geen onnodige statistiekpayload voor goalmarkten. Cache `markets-data:v5` bewaart
  nu ook H2H; eerdere cacheversies gooiden die context weg.
- Succesvolle publieke GETs hebben korte browser-/Netlify-CDN-caching met queryvariatie.
  Fouten en writes niet publiek cachen.
- Databasegatewayfouten en provideruitval mogen niet worden vermomd als lege data.
  Er is een gerichte retry voor PGRST303 ‘JWT issued at future’ bij Supabase secret
  keys. Echte invalid-key/permission-fouten niet eindeloos herhalen. Ambigue writes
  niet automatisch opnieuw versturen.
- Geplande bronupdates rond **07:35 en 23:35 Europe/Brussels**, met UTC-cron en
  lokale uurcontrole voor zomer-/wintertijd. Geen gegarandeerde live-scorefeed.

## Configuratie en beveiliging

Zie `.env.example` en `server/config.ts`. Zet productievariabelen in de juiste
Netlify-context en scope, en redeploy na wijzigingen.

| Variabele                                           | Gebruik                                                   |
| --------------------------------------------------- | --------------------------------------------------------- |
| `VITE_DEMO_MODE`                                    | Build/frontend; `false` voor echte data.                  |
| `DEMO_MODE`                                         | Functions; `false` voor echte data.                       |
| `FOOTBALL_PROVIDER`                                 | Standaard `free-football`; optioneel `api-football`.      |
| `FOOTBALL_SEASON`                                   | Seizoenstartjaar; momenteel 2026 betekent 2026/27.        |
| `SUPABASE_URL`                                      | Supabase-project-URL.                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                         | Alleen serveromgeving, nooit in browser of repository.    |
| `SYNC_SECRET`                                       | Serversecret voor beschermde synchronisatie/updates.      |
| `FOOTBALL_DATA_ORG_KEY`                             | Optionele terugvalbron; uitsluitend Production Functions. |
| `API_FOOTBALL_KEY`                                  | Alleen nodig bij de optionele betaalde legacy-provider.   |
| `ODDS_API_KEY`, `ODDS_REGION`, `ODDS_CACHE_SECONDS` | Optionele oddsvergelijkingsfeed.                          |

Geen echte sleutels in dit document, screenshots, logs, commits of browserconsole.
Gebruik nooit `VITE_` voor een secret. RLS en API-validatie niet uitschakelen om een
configuratiefout op te lossen. Demo toont expliciet fictieve data en geen verzonnen
bookmakerprijzen; productieproblemen mogen niet stil terugvallen op demo.

## Talen, logo’s en mobiele UX

- `src/i18n/index.ts`: `t` voor presentatietekst, `tr` voor interpolaties,
  `locale()` voor datums, bewaarde NL/EN-keuze via `matchday:language`.
- Engelse vertalingen in `src/i18n/en.json`. Ook aria-labels, placeholders,
  dynamische bronmeldingen en mobiele CSS-labels moeten beide talen ondersteunen.
- Vertaal geen IDs, enumwaarden, bookmakerwaarden, berekeningen of opgeslagen records.
  Vertaalde `<option>`-elementen hebben een expliciete oorspronkelijke `value`.
- Raw bron-JSON blijft ongewijzigd. Onbekende brontekst blijft behouden; geen gokvertaling.
- Clublogo’s staan lokaal in `public/clubs`; bron/rechten in `CREDITS.md`. Ontbrekende
  afbeeldingen vallen terug op een schild. Favicon: SVG + ICO; Apple-touchicoon aanwezig.
- Nieuwe schermen testen op minimaal 390 px en een smallere telefoonbreedte; geen
  paginabrede horizontale overflow. Tabellen/carrousels mogen lokaal scrollen.
- Houd rekening met ondernavigatie en safe areas; geen bedekte knoppen/modals.

## Tests, lokale start en opleveren

```sh
npm ci
npm run dev          # Vite, standaard demo via .env.example
npm run dev:full     # Netlify Functions + frontend
npm test            # Vitest
npm run test:e2e     # Playwright desktop + mobiele Chromium
npm run build       # TypeScript + productiebuild
npm run format:check
```

Playwright gebruikt doorgaans een vaste testdatum (12 september 2026). Gebruik bij
nieuwe datumafhankelijke tests ook een vaste klok. Gebruik synthetische fixtures
voor grensgevallen, geen live odds als stabiele testverwachting. Scripts in `scripts/`
kunnen echte endpoints/layouts controleren met uitsluitend procesomgevingcredentials.

Controleer voor een wijziging `git status`. Draai relevante tests en de build,
inspecteer de mobiele weergave bij UX-wijzigingen, commit alleen bedoelde bestanden
en meld wat getest is. Verifieer de push; Netlify kan daarna nog bezig zijn met de
deploy. Werk deze overdracht bij als de beschreven werking verandert.

## Bekende beperkingen en volgende uitbreidingen

Geen gegarandeerde liveodds/livescores, geen complete player-marktdekking, geen
accountgebonden historiek, geen gekalibreerde win-/combislaagkans en geen echte
bookmaker-betbuilderafrekening. Meer variatie of hogere doelodds verandert dat niet.

Nieuwe competities vragen meer dan een dropdown: gecontroleerde aliases, IDs,
bronroutes, tijdzones, odds-mapping, spelersmapping, logo’s en tests. Nieuwe
statistiekmarkten vragen voldoende historische dekking én corresponderende odds.
