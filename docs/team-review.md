# Matchday reviewteam

## Rollen

| Rol                 | Verantwoordelijkheid                                                                |
| ------------------- | ----------------------------------------------------------------------------------- |
| Webdesigner         | Werkende interface, visuele rust, mobiel, toegankelijkheid, NL/EN.                  |
| Functioneel analist | Gebruikersdoel, flows, productregels, datakwaliteit, acceptatiecriteria.            |
| Developer           | Technische oorzaken, prestaties, foutafhandeling, tests en uitvoerbaarheid.         |
| Infra               | Hosting, database-/providerbelasting, caches, betrouwbaarheid, kosten en metingen.  |
| Architect           | Datastromen, systeemgrenzen, laadpad, datacontracten en stapsgewijze veranderingen. |
| Hoofdagent          | Scope, taakverdeling, bewijscontrole, kruisreview en één gezamenlijke oplevering.   |
| Gebruiker           | Eindbeslissing: selecteren, aanpassen, uitstellen of afwijzen per voorstel.         |

## Gebruik

Vraag bijvoorbeeld:

> Laat het team de flow combivoorstel → matchanalyse → teruggaan reviewen.
> Controleer desktop en mobiel en lever maximaal vijf voorstellen. Nog niets uitvoeren.

Voor snelheid en schaalbaarheid:

> Laat infra en architect onderzoeken waarom de eerste datalading traag is.
> Laat de webdesigner de ervaren wachttijd beoordelen. Lever een meetplan en
> maximaal vijf geprioriteerde voorstellen; niets implementeren.

Infra onderzoekt de uitvoering en capaciteit van hosting, opslag en databronnen.
De architect onderzoekt afhankelijkheden en datastromen tussen die onderdelen.
Beiden onderbouwen hun advies met code of metingen; de webdesigner beoordeelt
wat de gebruiker tijdens de wachttijd ziet en al kan doen.

Of na een review:

> Implementeer voorstel R1 en R3 uit de review van 10 oktober 2026.
> Laat de andere voorstellen staan.

Agentdefinities staan in `.codex/agents/*.toml`; `.codex/config.toml` stelt
maximaal drie gelijktijdige subagents in. Het team heeft vijf specialisten; de
coördinator kiest per taak de relevante rollen en plant overige rollen in een
volgende ronde. Model en permissies worden geërfd.
De profielen leggen werkafspraken vast; ze zijn geen technische schrijfbeveiliging.
Alle specialisten starten in reviewmodus, ook wanneer schrijfrechten beschikbaar zijn.

Lokale Codex-clients kunnen deze projectprofielen laden. Heropen bij nieuwe
configuratie de projectsessie indien nodig. De actieve sessie kan dezelfde rollen
ook expliciet aan gedelegeerde agents meegeven. Als profielen of parallelle agents
niet beschikbaar zijn, meld dat; claim geen onafhankelijke teamreview als één
agent alleen drie perspectieven heeft beschreven.

Dit is een team op afroep, geen achtergrondproces of geplande dagelijkse review.

## Werkwijze

1. De coördinator legt flow, branch/commit, scope en beperkingen vast.
2. Iedere rol onderzoekt onafhankelijk en rapporteert maximaal drie bevindingen.
   Bestaande tests uitvoeren en tijdelijke screenshots/reproducties zijn toegestaan;
   applicatiecode, instellingen van productie en echte data blijven ongemoeid.
3. De coördinator laat relevante rollen elkaars voorstellen toetsen, combineert
   overlap en controleert bewijs. Consensus is niet verplicht en geen bewijs op zich.
4. Leg maximaal vijf voorstellen vast in `docs/reviews/`, met stabiele ID's.
   Elk voorstel krijgt status **Voorgesteld — wacht op gebruikerskeuze**.
5. De gebruiker kiest welke voorstellen worden uitgevoerd. Noteer die keuze
   met datum en exacte scope. Ongekozen voorstellen blijven onaangeroerd.
6. Alleen daarna implementeert de developer de gekozen scope. De andere rollen
   toetsen het resultaat aan de acceptatiecriteria. De coördinator integreert en
   publiceert uitsluitend binnen de bestaande gebruikersautorisatie.

Een reviewopdracht is nooit een implementatieopdracht. Een eerder akkoord om code
te pushen geeft geen toestemming om nieuwe, ongekozen productvoorstellen te bouwen.
Vraag geen herbevestiging voor werk dat de gebruiker al expliciet heeft geselecteerd.

## Voorstelformaat

- **ID en titel**
- **Status en prioriteit:** voorgesteld, geselecteerd, uitgesteld, afgewezen, uitgevoerd.
- **Probleem en gebruikersimpact**
- **Bewijs:** bestand/regelnummers, reproductiestappen, screenshot of testresultaat.
- **Zekerheid:** waargenomen, uit code vastgesteld of nog te toetsen hypothese.
- **Voorstel en eventueel alternatief**
- **Inspanning en risico:** schatting, geen leverbelofte.
- **Acceptatiecriteria**
- **Review van andere rollen en eventuele meningsverschillen**
- **Beslissing gebruiker:** nog niet genomen of expliciete selectie met datum.

Bescherm altijd de regels uit PROJECT_CONTEXT.md. Een lagere historische drempel,
fictieve odds of het negeren van ontbrekende data is geen oplossing voor lege resultaten.

## Configuratiebron

De standalone TOML-profielen volgen de officiële
[Codex-documentatie voor subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
Configuratie gecontroleerd met de lokaal beschikbare Codex-versie; geen afzonderlijke
API-dienst of nieuwe sleutel nodig voor deze teamafspraken.

## Performance-reviewafspraken

- Scheid lege browsercache, lege server-/broncache, function cold start en een
  herhaalbezoek. Een lege browsercache bewijst geen koude servercache.
- Noteer route, versie, datum, omgeving, cachetoestand indien bekend, aantallen
  waarnemingen, payloadgrootte en eerste bruikbare inhoud. Noem synthetische
  vertragingen simulaties en presenteer losse live samples niet als p95/SLA.
- Controleer het netwerkpad, seriële aanvragen, rendering/layoutverschuivingen,
  database-/providerfanout, retries en limieten.
- Doe geen productie-loadtest of wijziging aan betaalde capaciteit bij een review.
  Zonder productie-observability blijft een capaciteitsclaim onbewezen.
- Stel doelen voor echte én ervaren laadtijd voor. Een skeleton is geen
  versnelling van een API; parallelle requests zijn niet automatisch minder belasting.
- Behoud originele observatietijden; oudere data tonen vraagt expliciete provenance
  en mag de geldigheidsregels van odds/historie niet omzeilen.
