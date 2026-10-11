# Review: eerste opening van de website

Datum: 11 oktober 2026. Codebasis: `3698415` op `main`.
Scope: eerste websitebezoek; gebruiker bevestigt dat hier de wachttijd zit.
Infra, architect en webdesigner hebben onafhankelijk onderzocht. Infra en
architect hebben het voorstel voor een voorbereid dagprogramma onderling getoetst.
De nieuwe rolprofielen zijn toegevoegd. Implementatie is op 11 oktober 2026 goedgekeurd.

## Bewijs en beperkingen

- `src/components/Dashboard.tsx`: `Promise.all` wacht op zowel wedstrijden als
  competitiemetadata voordat de lijst zichtbaar wordt. Ook odds en Spotlight
  starten pas na deze stap. Metadata kan dus het hele programma ophouden.
- Gecontroleerde lokale Chromium-simulatie: fixtures kunstmatig 300 ms vertraagd,
  competities 2500 ms. Op 1440/390/360 px waren fixtures na respectievelijk
  497/485/477 ms beschikbaar, competities na 2697/2684/2678 ms; de test constateerde
  de zichtbare lijst na 3043/3013/3008 ms. Dit bevestigt de afhankelijkheid,
  geen productiesnelheid of exacte rendertijd (de locator wordt gepolld).
  Afzonderlijke lokale controle vond op deze breedtes geen horizontale overflow.
- `Dashboard.tsx` plaatst Spotlight boven het programma na de fixturelading.
  `Spotlight.tsx` vervangt daarna een kleine laadmelding door kaarten.
  De opmaak reserveert daarvoor geen gelijkwaardige hoogte: risico op verschuiving.
  De grootte van een eventuele verschuiving is nog niet gemeten.
- `server/providers/free-football.ts`: fixtures voor één dag worden uit een
  seizoenslading gefilterd. Bij lege caches kan die eerst schema, uitslagen,
  komende wedstrijden en ESPN-herstel voor eerdere dagen ophalen.
  `multi-league.ts` wacht op alle vijf competities.
- `server/service.ts`: dagfixtures hebben 300 seconden cache; cachemisses doorlopen
  opslag, lock, hercontrole, bronwerk en wegschrijven. De nachtelijke taak wist
  afgeleide caches na bronverversing zonder het dagprogramma opnieuw klaar te zetten.
- Eenmalige, opeenvolgende publieke productieaanvragen: HTML 0,31 s totaal;
  competities 1,27 s (662 bytes gedecodeerd); dagfixtures 0,78 s
  (23.132 bytes, 17 wedstrijden). CDN meldde voor beide API-antwoorden stale/revalidatie.
  Geen `Server-Timing`. Deze tijden mogen niet worden opgeteld tot paginalaadtijd.
  Backendcache, function cold start en uitgerolde commit zijn hiermee niet vastgesteld.
  Geen productie-loadtest uitgevoerd; geen toegang tot Netlify/Supabase-detailmetingen.
- Bestaande cache-, nightly-, resilience- en memory-cachetests: 24 geslaagd.
  Geen applicatiecode gewijzigd; daarom geen nieuwe productiebuild nodig.

## Voorstellen

Status: **Goedgekeurd en lokaal geïmplementeerd; productiecontrole volgt na deploy**.

De gebruiker keurde alle vier punten uit de gespreksamenvatting goed: P1, P2, P3
en het gecombineerde vierde punt (P4 vooraf klaargezet dagprogramma + P5 tests
voor piekbelasting). Dit akkoord omvat geen productie-loadtest of nieuwe betaalde
infrastructuur. De voorkeursvolgorde programma vóór Spotlight wordt uitgevoerd.

### P1 — Toon het programma zodra de wedstrijden beschikbaar zijn

- Impact: trage competitiemetadata houdt de lijst niet meer tegen.
- Aanpak: laad fixtures en metadata onafhankelijk; gebruik competities uit de
  fixtures voor de beschikbare filters, zoals de analysekiezer al doet.
  Metadatafouten mogen geldige wedstrijden niet verbergen.
- Inspanning: klein. Risico: laag; let op filters, annulering en datumwissels.
- Acceptatie: bij fixtures na 300 ms en metadata na 2500 ms verschijnt de lijst
  vóór de metadata. Filters en foutmeldingen blijven correct in NL/EN, op desktop
  en mobiel. Geen extra fixtureaanvragen of verlies van bestaande navigatiecache.

### P2 — Maak de eerste laadweergave rustig en stabiel

- Impact: eerder herkenbare structuur en geen onverwacht opschuivende wedstrijden.
- Aanpak: toon meteen programmastructuur met passende laadplaatsen. Reserveer
  stabiele ruimte voor Spotlight, of zet het programma vóór Spotlight.
  Voorkeur webdesigner: programma eerst; deze volgorde blijft een productkeuze.
  Toon odds afzonderlijk zodra beschikbaar, met eerlijke laad- en foutstatus.
- Inspanning: klein/middel. Risico: laag; gereserveerde ruimte kan leeg ogen.
- Acceptatie: vertraag fixtures en Spotlight onafhankelijk; meet de positie van
  de eerste wedstrijd vóór/na Spotlight. Geen verspringende focus of bedekte acties
  op 1440/390/360 px. Spotlightuitval blokkeert het programma niet.
  Laadplaatsen verbeteren de ervaring, niet de feitelijke API-snelheid.

### P3 — Meet waar de eerste lading tijd verliest

- Impact: onderscheid tussen browserwerk, database, cache, lockwachttijd en bronnen.
- Aanpak: begrensde timingmetingen per fase en tijd tot eerste bruikbare lijst.
  Registreer hit/miss, routecategorie en timings zonder secrets of persoonsgegevens.
  Meet eerste/herhaalbezoek en warme/lege cache apart in gecontroleerde omstandigheden.
- Inspanning: klein/middel. Risico: laag; begrens logvolume en kosten.
- Acceptatie: één trage aanvraag is tot fases te herleiden; rapporteer percentielen
  pas bij voldoende representatieve samples. Meet met dezelfde build vóór/na P1/P2.
- Terugval: timingregistratie uitzetten zonder verandering aan het datacontract.

### P4 — Bereid een compact dagprogramma vooraf voor

- Impact: een bezoek hoeft bij een cachemiss mogelijk niet op seizoensherstel te wachten.
- Aanpak: apart leespad voor het dagprogramma, met begrensde achtergrondverrijking.
  Publiceer een geldige nieuwe versie atomair na succesvolle opbouw. Stem updates af
  op werkelijke geldigheidsduur; twee dagelijkse cronruns lossen een vijfminutencache
  niet vanzelf op. Begin pas met concrete implementatie na de metingen van P3.
- Inspanning: groot. Risico: middel; actualiteit, mislukte updates en dubbele bronlast.
- Acceptatie: aantoonbaar minder bronwerk in het bezoekerspad, behoud van oorspronkelijke
  datatijden en bestaande grenzen voor verouderde data. Ontbrekende historie blijft
  uitgesloten van voorstellen. Geen gewijzigde odds- of kwalificatieregels.
- Terugval: bestaand leespad beschikbaar houden; geen nieuwe infrastructuurdienst
  kiezen zonder gemeten noodzaak. Infra en architect ondersteunen dit voorstel samen.

### P5 — Toets piekbelasting met gesimuleerde bronnen

- Impact: minder kans op gelijktijdige bronaanvragen, retries en onverwachte 503-fouten.
- Aanpak: gecontroleerde tests met meerdere instanties/lege caches, bestaande locks
  en providerbudgetten. Nu zijn er limieten van 300 originrequests/minuut globaal
  en 60 per IP; dit zijn geen bezoekersaantallen. CDN-hits vallen daarbuiten.
  De fallbackbron heeft negen aanvragen/minuut; vijf competities met twee seizoenen
  kunnen bij lege caches tien aanvragen vragen.
- Inspanning: middel. Risico: laag bij mocks; werkelijke capaciteit blijft onbekend.
- Acceptatie: test toont begrensd bronwerk, begrijpelijk foutgedrag en herstel zonder
  retrygolf. Geen productie-loadtest en geen blinde verhoging van limieten.
  Alleen aantoonbaar nodige aanpassingen komen terug als nieuw implementatievoorstel.

## Advies

Begin met P1, P2 en P3: zichtbaar resultaat, beperkte scope en meetbaar vervolg.
P4 is de grotere structurele stap als metingen het bronwerk als knelpunt bevestigen.
P5 toetst de groeiruimte zonder nu een nieuwe stack te introduceren.
De afhankelijkheid tussen matchanalyse en odds en de omvang van analysepayloads
zijn ook gesignaleerd, maar vallen buiten deze focus op het openen van de website.
De gebruiker kiest welke voorstellen uitgevoerd worden.

## Uitvoering en verificatie

- P1/P2: dashboard vraagt geen aparte competitiemetadata meer, toont een vaste
  programma-laadstructuur en plaatst Spotlight na de wedstrijden. Gerichte
  Chromiumtest dekt desktop, mobiel en 360 px met vertraagde fixtures/Spotlight,
  datumwissel, mislukte eerste lading en refresh. De wedstrijdpositie bleef gelijk.
  Bij dezelfde gecontroleerde fixturevertraging van 300 ms was de lijst na de
  wijziging waarneembaar rond 585 ms op 1440 px en 575 ms op 390 px; er werd geen
  metadata-aanvraag gedaan. Dit is een lokale simulatie, geen productieclaim.
- P3: lokale browsermeasure en `Server-Timing` voor origin-aanvragen met vaste
  labels, cachetellers, database- en primaire bronfasen. CDN-antwoorden kunnen
  eerder gemeten headers herhalen; er is nog geen representatieve productiepercentiel.
- P4: selectief dagpad en elke vijf minuten geplande voorbereiding voor vandaag in
  Brusselse tijd. De reguliere vijfminutenvervaldatum blijft van kracht. Bij een
  mislukte voorbereiding blijft een nog geldige momentopname staan; na verval
  kan een bezoek opnieuw de provider aanroepen. Meer Function-aanroepen per dag
  vragen opvolging van verbruik en daadwerkelijke herkomsttijden.
- P5: synthetische tests dekken 24 gelijktijdige instanties, een gedeelde bezoekerslock
  en begrensd BusyError-gedrag wanneer een andere instantie de lock houdt.
  Voorbereiding heeft een aparte lock: een trage achtergrondtaak houdt bezoekers
  niet vast. In de test ontstaan maximaal twee parallelle vullingen (achtergrond
  en bezoekersgroep); broncache en bronlimieten blijven gelden.
  Dit bewijst geen productiecapaciteit; er is geen productie-loadtest uitgevoerd.
- 187 unit/integratietests, 67 volledige browserchecks (3 bewust overgeslagen),
  formattering en productiebuild geslaagd.
  Een live Netlify-deploy of Supabase/Function-metrieken zijn hier niet geverifieerd.
