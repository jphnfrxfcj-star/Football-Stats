# Interface languages

Dutch is the default. The language selector stores `nl` or `en` in the browser under
`matchday:language`. Switching language rerenders presentation without remounting
pages, refetching data or rewriting saved combination records.

Wrap displayed text, accessible labels and placeholders with `t(...)`. Add its Dutch
source text and English translation to `en.json`. Use `tr('Text {0}', [value])` for
interpolated copy. `locale()` selects `nl-BE` or `en-GB` for date formatting.

Keep API identifiers, bookmaker values, market keys, team names and stored data in
their original form. In particular, translated select options must have an explicit
untranslated `value`. Raw source JSON remains unchanged.

Known server messages and historical narrative templates are translated at display
time. Unknown text is preserved, never guessed or sent to an external translator.
Add translations when introducing new user-facing API messages.
