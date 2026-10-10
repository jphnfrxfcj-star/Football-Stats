# Teamreview: combivoorstel → matchanalyse → teruggaan

Datum: 10 oktober 2026. Beoordeelde applicatiecommit: `f433594`.
Rollen: webdesigner, functioneel analist en developer, als drie afzonderlijke
subagents met een hoofdagent die bevindingen samenvoegt.

**Beslissing gebruiker: R1, R2, R3 en R4 geselecteerd op 10 oktober 2026.**
Voor R4 wordt de aanbevolen optie A uitgevoerd: analyse én odds vernieuwen.
De vier voorstellen zijn geïmplementeerd; eindvalidatie staat onderaan.

## Wat al goed werkt

De designer testte met synthetische odds en demoanalyse op 1440, 390 en 360 px.
De normale route van combivoorstel naar analyse en ‘Terug naar overzicht’ herstelt
exact de scrollpositie (927, 1689 en 1746 px), behoudt uitgeklapte onderbouwing
en veroorzaakt geen horizontale overflow.

De analist bevestigde de bewuste scheiding tussen vaste combimomentopnames en
opslaan: een favoriet wordt getoetst aan de echte tijd en kan niet na aftrap worden
opgeslagen. Automatisch verversen opnieuw invoeren is geen voorgestelde oplossing.

## Overzicht ter beslissing

| ID  | Prioriteit | Voorstel                                                 | Inspanning   | Risico | Status     |
| --- | ---------- | -------------------------------------------------------- | ------------ | ------ | ---------- |
| R1  | Hoog       | Behoud combivoorstellen bij mislukte handmatige refresh  | Middel       | Middel | Uitgevoerd |
| R2  | Hoog       | Herstel sectiepositie bij browser terug/vooruit          | Klein–middel | Middel | Uitgevoerd |
| R3  | Middel     | Maak analyselinks in combikaarten makkelijker aantikbaar | Klein        | Laag   | Uitgevoerd |
| R4  | Middel     | Maak de scope van analyse-refresh duidelijk              | Middel       | Middel | Uitgevoerd |

Inspanning en risico zijn schattingen. Prioriteit is advies, geen automatische selectie.

## R1 — Voorstellen behouden tijdens handmatig verversen

**Probleem:** de eerdere momentopname wordt direct gewist, nog voordat nieuwe
gegevens beschikbaar zijn. Bij bronuitval verdwijnen ook de eerder gelezen kaarten
met hun open details.

**Bewijs:** codecontrole in `src/components/ComboFinder.tsx:59` (`setReport(null)`)
en de laad-/fouttak vanaf regel 316. Door functioneel analist vastgesteld en door
developer en designer mee beoordeeld. De bijbehorende scrollsprong bij een
mislukte refresh is in deze review niet afzonderlijk in de browser geïnjecteerd.

**Voorstel:** bij dezelfde instellingen blijven kaarten zichtbaar tijdens ophalen
én berekenen. Vervang de set pas wanneer de nieuwe resultaten gereed zijn. Bij een
fout blijven de oude momentopname en oorspronkelijke tijd zichtbaar, met foutmelding.

**Acceptatiecriteria:**

- Desktop en mobiel behouden kaarten, open details en scroll tijdens een mislukte refresh.
- De vorige tijd wordt nooit vervangen door een nieuw tijdstip bij een fout.
- Gewijzigde zoekvoorwaarden tonen nooit ongemarkeerd resultaten van vorige instellingen.
- Automatische herberekening blijft uit; opslaan blijft de echte aftraptijd controleren.

**Risico:** een refresh onderscheiden van gewijzigde instellingen vraagt zorg in de state.
**Kruisreview:** alle drie rollen ondersteunen dit voorstel.
**Beslissing gebruiker:** geselecteerd op 10 oktober 2026; uitgevoerd.

## R2 — Browsergeschiedenis bij sectielinks herstellen

**Probleem:** vooruitgaan naar een eerder geopende analysesectie zet de pagina bovenaan.

**Reproductie:** `/analyse` → wedstrijd → ‘Recente vorm’ (`#form`) → browser terug
→ browser vooruit. De URL eindigt op `#form`, maar scroll staat op 0.
Developer reproduceerde dit op desktop (2692 → 0 px) en iPhone 13 (5045 → 0 px).

**Bewijs:** `src/components/usePageNavigation.ts:29` maakt voor native hashgeschiedenis
zonder `history.state` een nieuwe ID zonder die te bewaren; het herstel vanaf
regel 41 kiest daardoor 0. Sectielinks staan in `src/components/MatchPage.tsx:189`.

**Voorstel:** geef ook native sectiegeschiedenis een stabiele identiteit en herstel
de eerdere positie of het anker zodra de inhoud beschikbaar is.

**Acceptatiecriteria:**

- Browser terug/vooruit herstelt de gekozen sectie/positie op desktop en mobiel.
- ‘Terug naar overzicht’ blijft filters, voorstellen en open details herstellen.
- Het herstel start geen nieuwe analyse-aanvraag.

**Risico:** afstemming tussen native ankers en eigen History API.
**Kruisreview:** designer onderschrijft prioriteit; de normale retourtest en deze
ankertest zijn verschillende scenario's en spreken elkaar niet tegen.
**Beslissing gebruiker:** geselecteerd op 10 oktober 2026; uitgevoerd.

## R3 — Analyselinks in combikaarten verbeteren

**Probleem:** de klikzone rond de wedstrijdnaam is klein en lijkt op gewone metadata.
Designer mat een hoogte van 12 px op mobiel en 13 px op desktop.

**Bewijs:** browsercontrole op 1440/390/360 px, `src/components/ComboFinder.tsx:498`
en `src/styles.css:2113` / `src/styles.css:3237`.
Tijdelijke screenshots: `/tmp/combis-{1440,390,360}.png` en
`/tmp/match-{1440,390,360}.png`. Deze lokale bestanden zijn niet onderdeel van Git.

**Voorstel:** een herkenbare analyselink met subtiel icoon of label en minimaal
44 px hoge aanraakzone op mobiel. Opslaan en onderbouwing blijven afzonderlijke acties.

**Acceptatiecriteria:**

- Minimaal 44 px hoge aanraakzone op 360 en 390 px, zonder overlap of overflow.
- Duidelijke toetsenbordfocus en begrijpelijke NL/EN-benaming.
- Compacte kaarten, open details en terugnavigatie blijven behouden.

**Risico:** laag; bewaak dat grotere aanraakvlakken de kaart niet onnodig lang maken.
**Kruisreview:** functioneel analist bevestigt haalbaarheid zonder productregelwijziging.
Houd acties gescheiden, kap lange teamnamen niet af en behoud de terugkeer naar
dezelfde kaart/details/scrollpositie. De afmeting is een browserwaarneming van de
designer; geen formele toegankelijkheidsaudit of gebruikersonderzoek uitgevoerd.
**Beslissing gebruiker:** geselecteerd op 10 oktober 2026; uitgevoerd.

## R4 — Scope van analyse-refresh verduidelijken

**Probleem:** bovenaan bijwerken vernieuwt de analyse maar niet de afzonderlijke
bookmakerodds. De bronmomenten op één pagina kunnen dus verschillen.
Dat de huidige presentatie verwarring veroorzaakt is een UX-hypothese; het is
geen bewijs dat prijzen verkeerd worden berekend.

**Bewijs:** `src/components/MatchPage.tsx:70` vraagt alleen de analyse op;
`src/components/OddsComparison.tsx:43` reageert alleen op wedstrijd-ID/eigen refresh.
Designer wijst op de algemene tekst ‘Analyse bijgewerkt’ naast de bovenste actie.

**Voorstel A (voorkeur analist/designer):** de bovenste actie vernieuwt analyse én odds,
met aparte brontijden en foutstatussen. De lokale oddsrefresh mag blijven.
**Alternatief B:** behoud gescheiden acties, maar benoem expliciet welke gegevens
elke actie ververst. Dit is een productkeuze voor de gebruiker.

**Acceptatiecriteria:**

- Bij A zijn beide aanvragen aantoonbaar; bij B is de scope in NL/EN duidelijk.
- Gedeeltelijke bronuitval behoudt eerdere informatie van die bron met foutmelding.
- Werkelijke observatietijden blijven behouden; oude prijzen worden niet kunstmatig actueel.
- Gewone terugnavigatie veroorzaakt geen nieuwe fetch.

**Risico:** gedeeltelijk geslaagde updates moeten duidelijk worden afgehandeld.
**Kruisreview:** developer bevestigt de gescheiden fetches en adviseert dit als
productkeuze te behandelen, niet als vastgestelde foutieve odds.
**Beslissing gebruiker:** geselecteerd op 10 oktober 2026; uitgevoerd.

## Validatie en beperkingen van de oorspronkelijke review

- Drie rollen hebben onafhankelijk onderzocht; overlap is geconsolideerd.
- Browserreview en ankerreproductie gebruiken Chromium, synthetische data en demoanalyse.
- Developer draaide twee bestaande read-cache-unit-tests: beide geslaagd.
- Geen live odds/providerbeschikbaarheid onderzocht, geen Safari-test uitgevoerd.
- Applicatiecode is tijdens deze review niet aangepast. Geen nieuwe productiebuild
  nodig voor uitsluitend agentconfiguratie en documentatie.
- TOML-syntax en verplichte profielvelden gecontroleerd; lokale Codex app-server
  accepteert projectconfiguratie met `--strict-config` en leest agents enabled/limiet 3.
- De eerste review gebruikte expliciet toegewezen rollen in de actieve sessie.
  Projectprofielen zijn voor volgende Codex-sessies beschikbaar; heropen zo nodig de sessie.

## Uitvoering na gebruikersselectie

- R1 publiceert rapport, beoordelingstijd en workerresultaten als één momentopname.
  De vorige set blijft behouden bij fetch- of workerfouten met dezelfde instellingen;
  gewijzigde filters verbergen de vorige set. De geselecteerde bookmaker blijft in
  de keuzelijst, ook wanneer een nieuwe bron die bookmaker niet terugstuurt.
- R2 geeft sectiegeschiedenis een blijvende ID en herstelt de echte leespositie.
- R3 gebruikt een herkenbare analyselink met icoon en minimaal 44 px aanraakhoogte
  op mobiel, met NL/EN-label en toetsenbordfocus.
- R4 vernieuwt analyse en odds onafhankelijk via één bovenste actie. Die blijft
  bezet tot beide klaar zijn; deeluitval behoudt de vorige gegevens van die bron.
- Designer leverde component/CSS, developer implementeerde R2 en reviewde R1;
  functioneel analist controleerde snapshotgrenzen en gedeeltelijke bronuitval.
  De subagents bereikten daarna hun gebruikslimiet. De coördinator heeft de laatste
  browser-, visuele en integratiecontroles zelf uitgevoerd.
- Visuele controle op 1440/390/360 px: 32 px desktop en 44 px mobiele klikzones,
  geen horizontale overflow, NL/EN-labels correct, terugkeer behoudt scroll en details.
- Browsertests bevatten fetch- en workerfouten, oorspronkelijke momentopnametijd,
  scrollbehoud en beide richtingen van gedeeltelijke analyse/oddsuitval.
- Eindvalidatie: 58 Playwright-tests geslaagd op desktop/mobiel; twee uitsluitend
  mobiele tests worden bewust overgeslagen in het desktopproject. Alle 176
  unit-tests en de productiebuild zijn geslaagd. Geen Safari/WebKit of live
  providerprijzen gevalideerd.
