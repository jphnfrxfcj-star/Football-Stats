# Werken aan Matchday

Lees eerst [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). Dat is de actuele overdracht
voor AI-sessies; de volledige chatgeschiedenis is niet nodig. Gebruik README.md
voor installatie-instructies en de code als bron bij afwijkingen.

- Werk PROJECT_CONTEXT.md bij wanneer routes, databronnen, productregels,
  configuratie of belangrijke beperkingen veranderen.
- Behoud Nederlandse én Engelse weergave. Nieuwe interfacecopy hoort in
  `src/i18n/en.json`; zie `src/i18n/README.md`.
- Bewaar geen sleutels, tokens of persoonlijke gegevens in documentatie of code.
  Serversleutels horen uitsluitend in de Functions-omgeving.
- Bescherm de productregels voor odds, historische frequenties, ontbrekende data
  en terugkerende ploegen. Verander die niet stilzwijgend voor meer resultaten.
- Controleer relevante functionaliteit op desktop en mobiel. Draai passende tests
  en de productiebuild bij functionele wijzigingen; vermeld beperkingen eerlijk.
- Geef wijzigingen en testresultaten kort in het Nederlands terug aan de gebruiker.

## Teamreviews en beslissingen

- Bij een expliciete teamreview: kies passende rollen uit `webdesigner`,
  `functioneel-analist`, `developer`, `infra` en `architect`, met één hoofdagent
  als coördinator. Bij schaalbaarheid, initiële laadtijd of data-inladen betrek je
  infra en architect; bij ervaren wachttijd ook de webdesigner. Maximaal drie
  subagents tegelijk; voer aanvullende reviews in een volgende ronde uit. Zie
  [docs/team-review.md](docs/team-review.md) en `.codex/agents/`.
- De gebruiker heeft de eindbeslissing over ieder verbeteringsvoorstel.
  Review betekent onderzoeken en adviseren; geen applicatiewijzigingen.
  Teamsetup of een review starten is geen toestemming om bevindingen te implementeren.
- Alleen expliciet geselecteerde voorstellen mogen worden uitgevoerd. Leg selectie
  en scope vast; een akkoord geldt niet automatisch voor andere voorstellen.
  Bestaande expliciete autorisatie binnen die scope hoeft niet opnieuw gevraagd.
- Laat de rollen elkaars voorstellen toetsen. Lever maximaal vijf geconsolideerde
  voorstellen met bewijs, impact, inspanning, risico en acceptatiecriteria.
  Verschillen van inzicht blijven zichtbaar. Kleine losse taken vereisen geen team.
