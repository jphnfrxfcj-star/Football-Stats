# Onderzoek combiselectie — 16 september 2026

## Conclusie

De historische 80%-eis is een patroonfilter, geen kansmodel of prijsbeoordeling.
In de onderzochte data voldeden 211 wedstrijden aan BTTS in minstens 4 van de
laatste 5 wedstrijden van **beide** ploegen. BTTS viel vervolgens in 115 van die
211 wedstrijden (54,5%). Dat percentage geldt voor deze steekproef, niet voor
iedere huidige selectie. De gemiddelde korte frequentie was 83,8%, de gewogen
modelschatting 66,2% en de Poisson-schatting 59,8%. Ook de uitgebreidere modellen
overschatten deze geselecteerde groep gemiddeld.

Daarom zijn extra context en een zichtbare prijscontrole ingevoerd. Dit bewijst
niet dat de nieuwe filter winstgevend is. De modellen blijven ongekalibreerd.

## Gevonden problemen

- De oorspronkelijke builder gebruikte alleen de gekozen historische reeks,
  beschikbare odds, doelodds en combinatieregels. Geen vergelijking met break-even.
- De compacte marktcache verwijderde de aparte H2H-reeks.
- H2H kreeg binnen twee leeftijdsklassen hetzelfde gewicht. Twee recente successen
  en twee oudere successen konden daardoor even zwaar tellen.
- Gedeelde wedstrijden werden wel gededupliceerd, maar de laatst doorlopen
  teamreeks bepaalde hun gewicht. Nu blijft het hoogste relevante gewicht behouden.
- Het moment van een prijswijziging is niet hetzelfde als het moment waarop een
  OPEN prijs opnieuw uit de bookmakerfeed is gelezen. Alleen dat laatste kan een
  ongewijzigde prijs opnieuw bevestigen; een cachehit kan dat niet.

## Wat nu wordt berekend

De oorspronkelijke historische eis blijft bestaan: een volledige reeks van
5/10/20 wedstrijden, voor beide ploegen afzonderlijk, zonder ontbrekende
waarnemingen als succes te tellen.

De standaard aanvullende prijscontrole gebruikt:

1. **Gewogen frequentiemodel met Beta(1,1)-prior.** Laatste 20 per ploeg;
   gewichten 1 voor duels 1–5, 0,75 voor 6–10 en 0,45 voor 11–20.
   Relevante thuis-/uitpositie krijgt factor 1,1. Aanvullende H2H krijgt
   `0,35 × 0,5^(ouderdom in dagen / 365)`, maximaal 10 duels.
   Gedeelde wedstrijden tellen één keer. H2H is context, geen verplichte drempel.
2. **Poisson-goalsmodel.** Dezelfde recente gewichten voor gescoorde en
   geïncasseerde goals. Verwachte thuisgoals zijn het geometrisch gemiddelde
   van thuisaanval en uitverdediging; voor uitgoals omgekeerd. BTTS is
   `(1-exp(-lambda_thuis)) × (1-exp(-lambda_uit))`. Totals gebruiken de som
   van beide intensiteiten; rustmarkten gebruiken waargenomen rustscores.
3. **Dekking.** Minstens 20 waargenomen marktuitslagen per ploeg in de laatste
   20 duels en minstens 5 in de relevante thuis-/uitreeksen.
4. **Prijs.** Beide modellen moeten minstens 5 procentpunten boven `100 / odd`
   liggen. Bij 1,60 moeten ze dus allebei minstens 67,5% schatten.
   Dit is een expliciete conservatieve beleidsmarge, geen uit historische
   winst geoptimaliseerde grens of statistisch betrouwbaarheidsinterval.
5. **Actualiteit.** Feedprijs maximaal 15 minuten geleden daadwerkelijk
   waargenomen, of zonder observatietijd maximaal 15 minuten geleden gewijzigd.
   CSV-prijzen en onbekende/verlopen tijdstippen halen deze controle niet.

De twee modellen zijn gebaseerd op grotendeels dezelfde gegevens: ze zijn
**geen onafhankelijke bevestigingen**. Hun minimum wordt alleen als strenge
selectiegrens gebruikt, niet als gekalibreerde kans of statistische ondergrens.
De builder blijft daarna op doelodds/variatie rangschikken. Hij berekent geen
gezamenlijke combiwinstkans. Geen herhaalde ploeg en één bookmaker blijven vereist.

De gebruiker kan expliciet ‘Alleen historische frequentie’ kiezen. Daarbij staat
zichtbaar dat de prijs niet wordt beoordeeld. Beide pagina’s starten met de
prijscontrole actief; hogere doelodds/variatie versoepelen die nooit.

## Trends en H2H

De laatste vijf tellen zwaarder dan de vijf daarvoor; beide reeksen zijn afzonderlijk
zichtbaar. H2H staat van nieuw naar oud met uitkomst per datum. Zijn bijdrage neemt
continu af en is klein naast de recente teamreeksen. Twee recente BTTS-resultaten
wegen dus zwaarder dan twee oude, zonder van 2/4 een betrouwbaar percentage te maken.

Transfers, trainerswissels, blessures, opstellingen, xG en de sterkte van eerdere
tegenstanders zijn geen afzonderlijke inputs. Een gewijzigde ploegsterkte kan pas
via nieuwe waargenomen resultaten/goals doorwerken. Het model weet niet waarom
resultaten veranderen. De halfwaardetijd en recencygewichten zijn ontwerpkeuzes,
niet parameters waarvoor dit onderzoek optimale waarden heeft aangetoond.

## Chronologische controle

Reproduceer met `node scripts/audit-combo-model.mjs`. Volledige uitkomsten,
kansgroepen, uitsplitsingen en SHA-256-bronhashes staan in
[combo-model-audit.json](combo-model-audit.json). Downloads worden in de tijdelijke
systeemmap gecacht; geen API-sleutels nodig.

- Publieke [Football-Data-bestanden](https://www.football-data.co.uk/data.php).
- Premier League, La Liga, Serie A, Ligue 1; seizoen 2022/23 als aanloop.
- Evaluatie 2023/24 en 2024/25: 2.565 wedstrijden met minstens 20 eerdere duels
  per ploeg. Nieuwkomers met minder historie vallen uit deze evaluatie.
- Voor iedere wedstrijd alleen eerdere speeldagen, nooit uitslagen van dezelfde
  dag. Geen toekomstige resultaten als invoer, geen optimalisatie op testuitkomsten.
- Recente-5-frequentie als beschrijvende referentie, een voortschrijdend
  competitiegemiddelde, gewogen model en goalsmodel vergeleken.
- De goalsberekening wordt rechtstreeks uit de productiecode geïmporteerd.
- Brier-score, log loss en kansgroepen gerapporteerd. Lagere Brier is beter,
  maar bewijst op zichzelf geen kalibratie of bettingvoordeel.

| Markt                 | Korte frequentie | Competitiegemiddelde | Gewogen model | Goalsmodel |
| --------------------- | ---------------: | -------------------: | ------------: | ---------: |
| BTTS                  |           0,2656 |               0,2475 |        0,2483 |     0,2470 |
| Over 0.5              |           0,0622 |               0,0581 |        0,0596 |     0,0579 |
| Over 1.5              |           0,1900 |               0,1739 |        0,1755 |     0,1742 |
| Over 2.5              |           0,2654 |               0,2471 |        0,2459 |     0,2445 |
| Over 3.5              |           0,2272 |               0,2117 |        0,2112 |     0,2086 |
| Under 2.5             |           0,2654 |               0,2471 |        0,2459 |     0,2445 |
| Eerste helft over 0.5 |           0,2209 |               0,2033 |        0,2054 |     0,2048 |
| Eerste helft over 1.5 |           0,2515 |               0,2282 |        0,2315 |     0,2307 |

Het goalsmodel scoort gemiddeld iets beter dan de gewogen frequentie. Het verslaat
echter niet voor alle markten het simpele competitiegemiddelde, en bij BTTS niet
in elke competitie de gewogen berekening. Er is geen significantietoets of
onafhankelijke eindtest van de nieuwe selectiepolicy uitgevoerd. De cijfers
rechtvaardigen transparantere controles, geen claim van bewezen voorspelvoordeel.

Geen historische Unibet-BTTS-prijzen gebruikt: dit is geen ROI-backtest. De
5-procentpuntenfilter, dubbele-modelvoorwaarde, H2H-halfwaardetijd en prijseisen
zijn niet als winstgevende strategie gevalideerd. Meer complexiteit zonder een
aparte toekomstige validatieset zou gemakkelijk tot overfitting leiden.

## Methodologische bronnen en volgende stap

- [Dixon & Coles (1997)](https://rss.onlinelibrary.wiley.com/doi/abs/10.1111/1467-9876.00065):
  een uitgebreidere scorebenadering met tijdsafhankelijke teamsterkte en
  correcties voor lage scores. Het hier gebruikte eenvoudige Poisson-model
  is **geen** geschat Dixon–Coles-model.
- [Scikit-learn: kalibratie](https://scikit-learn.org/stable/modules/calibration.html):
  kansgroepen controleren en kalibratie loshouden van modeltraining;
  Brier/log loss meten meer dan alleen kalibratie.
- [Scikit-learn: tijdsvolgorde bij validatie](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html):
  latere waarnemingen mogen eerdere voorspellingen niet trainen.

Een volgende modelstap vraagt geschatte competitie-/tegenstandersterkte,
chronologische training/kalibratie, een onaangeraakte testperiode en echte
vooraf vastgelegde bookmakerprijzen. Tot die tijd blijven modeluitkomsten
ondersteunende schattingen en blijven ‘geen voorstel’ en ontbrekende data geldig.

## Implementatie en regressiecontrole

Tests dekken o.a. de BTTS-4/5-valkuil, marginale prijzen, ontbrekende historie,
verlopen/future/snapshotprijzen, verse observaties van ongewijzigde prijzen,
H2H-volgorde, trends, dubbeltellingen, toekomstige uitslagen, cache-roundtrips,
onveranderlijke opgeslagen modelsnapshots en het expliciet kiezen van de oude
historische modus. Browsercontroles op desktop, 360 en 390 pixels, in NL en EN.
