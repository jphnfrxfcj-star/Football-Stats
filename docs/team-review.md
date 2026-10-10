# Matchday reviewteam

## Rollen

| Rol                 | Verantwoordelijkheid                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| Webdesigner         | Werkende interface, visuele rust, mobiel, toegankelijkheid, NL/EN.                |
| Functioneel analist | Gebruikersdoel, flows, productregels, datakwaliteit, acceptatiecriteria.          |
| Developer           | Technische oorzaken, prestaties, foutafhandeling, tests en uitvoerbaarheid.       |
| Hoofdagent          | Scope, taakverdeling, bewijscontrole, kruisreview en één gezamenlijke oplevering. |
| Gebruiker           | Eindbeslissing: selecteren, aanpassen, uitstellen of afwijzen per voorstel.       |

## Gebruik

Vraag bijvoorbeeld:

> Laat het team de flow combivoorstel → matchanalyse → teruggaan reviewen.
> Controleer desktop en mobiel en lever maximaal vijf voorstellen. Nog niets uitvoeren.

Of na een review:

> Implementeer voorstel R1 en R3 uit de review van 10 oktober 2026.
> Laat de andere voorstellen staan.

Agentdefinities staan in `.codex/agents/*.toml`; `.codex/config.toml` stelt
maximaal drie gelijktijdige subagents in. Model en permissies worden geërfd.
De profielen leggen werkafspraken vast; ze zijn geen technische schrijfbeveiliging.
De developer start altijd in reviewmodus, ook wanneer schrijfrechten beschikbaar zijn.

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
