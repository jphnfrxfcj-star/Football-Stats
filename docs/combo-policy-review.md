# Tweede modelcontrole: eenvoudige homepage, uitgebreide combipagina

Datum: 16 september 2026. Dit document vervangt de **productkeuze** uit
[het eerste onderzoek](combo-model-review.md); de oorspronkelijke meetresultaten
blijven bewaard. Er is geen nieuwe gekalibreerde winstkans in productie gezet.

## Waarom verscheen er niets?

Een live controle van `/api/markets` voor 16–23 september, op 16 september rond
17:13 UTC, leverde 43 komende wedstrijden op. Deze momentopname is geen vaste
verwachting voor de huidige feed.

| Stap                                                    | 100% historie, laatste 5 | 80% historie, laatste 5 |
| ------------------------------------------------------- | -----------------------: | ----------------------: |
| Historisch passende selecties                           |                       26 |                      68 |
| Unibet-prijzen 1,10–3,00                                |                        2 |                      22 |
| Afgewezen wegens modelmarge                             |                        2 |                      18 |
| Afgewezen wegens onvoldoende modelhistorie              |                        0 |                       3 |
| Door strenge prijsfilter                                |                        0 |                       1 |
| Combivoorstellen met oorspronkelijke historische zoeker |                        0 |                       3 |
| Combivoorstellen met strenge prijsfilter                |                        0 |                       0 |

De prijzen waren recent geobserveerd. Bronuitval/oudere quotes waren dus niet de
hoofdoorzaak in deze controle. Er bleef één goedgekeurde selectie over, onvoldoende
voor een combinatie. Bij 100% waren er maar twee bruikbare selecties; hun gezamenlijke
odd bleef onder 2. Geen model mag daar fictieve odds of een versoepelde historische
norm voor in de plaats zetten.

De dubbele marge van vijf procentpunten was een **niet-gevalideerde beleidskeuze**.
Die als standaardvoorwaarde opleggen op de homepage was te ingrijpend. Een lege
uitkomst bewijst evenmin dat de prijsfilter goed voorspelt als dat ze kapot is.

## Nieuwe productlogica

### Homepage

- Eenvoudige historische x2–3-zoeker, maximaal drie voorstellen.
- Eigen historie-instellingen blijven behouden: 5/10/20 duels, 80/90/100% per ploeg,
  standaard nog steeds 100%. Geen automatische versoepeling.
- Geen extra beoordelingselector, verplichte dubbele modelmarge of modeltabellen.
- Echte beschikbare prijzen, één bookmaker, maximaal acht wedstrijden, geen
  terugkerende ploeg. Historie wordt niet als winstkans voorgesteld.

### Combipagina

- Standaard **Toon voorstellen met beoordeling**. Historisch passende, geprijsde
  selecties blijven beschikbaar. Geen automatische uitsluiting omdat modellen
  onder break-even liggen of onvoldoende dekking hebben.
- Eerst voorstellen waarvan beide modellen boven break-even liggen, daarna
  tegenstrijdige modelsignalen, vervolgens beide eronder, tenslotte niet betrouwbaar
  beoordeelbare prijzen. Dit is een diagnostische rangschikking, geen bewezen
  betere selectie- of winststrategie. Bron/steekproefproblemen blijven expliciet.
- Op iedere kaart staat het zwakste type beoordeling zichtbaar. Een lage prijs die
  beide modellen ongunstig beoordelen krijgt een waarschuwing, geen value-label.
- ‘Meer variatie’ werkt binnen dezelfde slechtste beoordelingsklasse. Het mag
  gunstig beoordeelde combinaties niet achter een zwakkere klasse plaatsen.
- De gebruiker kan expliciet **Alleen ruime modelmarge (experimenteel)** kiezen.
  De oorspronkelijke strenge voorwaarden blijven daarvoor intact: beide modellen
  ≥ vijf procentpunten boven break-even, recente feedprijs, voldoende historie.
- Ook zonder combi verschijnen beschikbare afzonderlijke selecties. De interface
  vermeldt hoeveel verschillende wedstrijden de strenge filter halen en waarom
  een combinatie niet kan worden opgebouwd. Een losse selectie wordt geen combi genoemd.
- Onbekende/verlopen prijzen krijgen geen actueel modelvoordeel of vergelijkingsmarge.
  Er worden maximaal twaalf losse voorbeelden getoond, naast maximaal negen combi’s.
- Opgeslagen voorstellen registreren `history`, `review` of `strict`. Oudere
  snapshots worden niet herschreven; dezelfde selectie blijft gededupliceerd.

## Algoritmische correcties

1. Eén gedeelde kandidaatselectie voor berekening, aantallen en afwijzingsredenen.
   Daardoor kunnen meldingen en werkelijke kandidaten niet verschillend filteren.
2. Eerst de nieuwste toepasselijke prijs kiezen (observatietijd, anders wijzigingstijd),
   daarna beoordelen. Geen oudere, gunstiger prijs kiezen omdat de nieuwste de
   margefilter niet haalt. Onder 1,10 en boven de gekozen doelodd blijven uitgesloten.
3. De zoekboom stopt niet meer onmiddellijk bij de eerste geldige combinatie.
   Voorbeeld: 1,40 × 1,50 = 2,10; toevoegen van 1,20 geeft 2,52, dichter bij het
   oorspronkelijke midden 2,50. Beide worden nu onderzocht zolang de limieten dat toelaten.
4. De limiet van 50.000 bezochte stappen blijft bestaan; rangschikking gaat over
   gevonden voorstellen, niet een bewezen globaal optimum. Betere beoordelingsklassen
   worden op de combipagina eerst onderzocht. Modelscores worden per gevonden pad
   hergebruikt om onnodige herberekening tijdens sortering te voorkomen.

## Verdergaande modeltoets

Reproduceer:

```sh
MATCHDAY_AUDIT_EXTENDED=1 node scripts/audit-combo-model.mjs
node scripts/compare-combo-policies.mjs
```

- Dezelfde vier competities en 2022/23 als aanloop.
- Sigmoidkalibratie van de Poisson-uitvoer uitsluitend op **2023/24**; vaste
  regularisatie 1, geen parameterzoektocht op de eindtest.
- Keuze tussen oorspronkelijke en gekalibreerde Poisson op **2024/25**.
- Nieuwe, vooraf niet onderzochte eindtest **2025/26**: 1.347 wedstrijden met
  minstens 20 eerdere waargenomen wedstrijden per ploeg.
- Alle invoer van eerdere speeldagen. Uitslagen van dezelfde dag worden uitgesloten.
- Vergeleken: voortschrijdend competitiegemiddelde, gewogen model, Poisson,
  minimum van beide, gemiddelde van beide en sigmoidkalibratie.
- Selectie op Brier-score; ook log loss en kansgroepen gepubliceerd.
- Uitvoer en SHA-256-bronhashes: [combo-policy-audit.json](combo-policy-audit.json).

### Brier-score op de nieuwe eindtest (lager is beter)

| Markt                 | Competitiegemiddelde | Gewogen | Poisson | Minimum van beide | Gekalibreerde Poisson |
| --------------------- | -------------------: | ------: | ------: | ----------------: | --------------------: |
| BTTS                  |               0,2492 |  0,2528 |  0,2499 |            0,2512 |                0,2488 |
| Over 0.5              |               0,0624 |  0,0644 |  0,0627 |            0,0645 |                0,0626 |
| Over 1.5              |               0,1869 |  0,1896 |  0,1887 |            0,1896 |                0,1870 |
| Over 2.5              |               0,2491 |  0,2512 |  0,2528 |            0,2532 |                0,2509 |
| Over 3.5              |               0,1970 |  0,1995 |  0,1982 |            0,1982 |                0,2000 |
| Under 2.5             |               0,2491 |  0,2512 |  0,2528 |            0,2508 |                0,2509 |
| Eerste helft over 0.5 |               0,2122 |  0,2181 |  0,2162 |            0,2175 |                0,2125 |
| Eerste helft over 1.5 |               0,2162 |  0,2196 |  0,2197 |            0,2195 |                0,2187 |

De minimumregel is geen beter gekalibreerde kans of statistische ondergrens.
De twee modellen delen hun gegevens en leveren dus geen onafhankelijke bevestiging.
Kalibratie helpt enkele markten, maar verslaat de simpele competitiebaseline niet
breed en overtuigend. De verschillen zijn klein; er is geen significantietoets
of bewijs van een blijvend voordeel. Daarom worden geen nieuwe geleerde parameters
of samengestelde winstkansen aan de productie toegevoegd.

### Prijsfilter nader onderzocht

Alleen voor over/under 2.5 bevatten de gebruikte bronbestanden bruikbare
Bet365-prijzen. Onder de 80%-historiefilter waren er 52 over- en 43 under-kandidaten
in de eindtest. De vijfprocentpuntenfilter behield 11 respectievelijk 17 selecties.
Bij een theoretische vaste eenheidsinzet was hun resultaat circa −24,7% en −43,6%.
Ook de beschreven nul- en tweeprocentpuntvarianten leverden in deze kleine subsets
geen positief gemiddeld resultaat.

Dit is **geen productie-ROI-backtest**: prijzen hebben geen exact observatietijdstip,
beschikbaarheid voor de gebruiker is niet bewezen, aantallen zijn klein en het
betreft Bet365-over/under, geen Unibet-BTTS of complete combinaties. De diagnose
geeft wel geen steun aan de stelling dat een strenge modelmarge vanzelf betere bets
selecteert. Geen van deze uitkomsten wordt gebruikt om een winstgevende grens te kiezen.

## Behouden nuance

Recente teamtrends wegen zwaarder dan oudere duels. H2H blijft beperkt en neemt
continu af met ouderdom; er is geen harde H2H-drempel. Transfers, opstellingen,
blessures en tegenstandersterkte zijn nog geen afzonderlijke modelvariabelen.
Meer complexiteit zonder aantoonbare onafhankelijke voorspelwaarde maakt deze
gegevens niet betrouwbaarder. Een werkelijk nieuwe productievoorspeller vraagt
verdere onafhankelijke seizoenen, kalibratie per markt, onzekerheidscontrole en
vooraf vastgelegde actuele prijzen.

Methodologische referenties:
[probability calibration](https://scikit-learn.org/stable/modules/calibration.html),
[chronologische validatie](https://scikit-learn.org/stable/modules/cross_validation.html),
[Football-Data-bronnen](https://www.football-data.co.uk/data.php).

## Controle van de implementatie

- 154 unit-/integratietests geslaagd, inclusief rangschikking, nieuwste prijs,
  uitbreiding van geldige combi’s en behoud van de bestaande productregels.
- Acht relevante browserscenario’s geslaagd op desktop en mobiel, inclusief
  Nederlands/Engels, historiek en een lege strenge filter met een losse kandidaat.
  Een parallelle herhaling liep bij drie mobiele scenario’s vast met time-outs;
  alle vier mobiele scenario’s slaagden daarna afzonderlijk in 7,5 seconden.
- Visuele controle op 360, 390 en 1440 pixels; geen paginabrede horizontale overflow.
- Dezelfde echte 80%-momentopname geeft met de aangepaste zoeker drie homepage-
  en negen uitgebreide voorstellen; de strenge filter blijft terecht zonder combi.
  Op 100% blijven beide zoekers leeg. Er zijn geen historische eisen versoepeld.
- Lokale berekening van de uitgebreide voorstellen duurde circa 46 ms op deze
  momentopname. Een synthetische belasting van 680 selecties bereikte de zoeklimiet
  binnen circa 174 ms. Dit is geen meting van mobiele snelheid of providerlatentie.
