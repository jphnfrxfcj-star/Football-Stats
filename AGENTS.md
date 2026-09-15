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
