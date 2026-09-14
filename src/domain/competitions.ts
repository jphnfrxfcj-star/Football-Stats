import type { Fixture, League } from './models';
export const competitions = {
  E0: {
    name: 'Premier League',
    country: 'Engeland',
    file: 'en',
    timezone: 'Europe/London',
    espn: 'eng.1',
    apiId: '39',
    unibet: 'football/england/premier_league',
    group: 1000094985,
  },
  SP1: {
    name: 'La Liga',
    country: 'Spanje',
    file: 'es',
    timezone: 'Europe/Madrid',
    espn: 'esp.1',
    apiId: '140',
    unibet: 'football/spain/la_liga',
    group: 1000095049,
  },
  I1: {
    name: 'Serie A',
    country: 'Italië',
    file: 'it',
    timezone: 'Europe/Rome',
    espn: 'ita.1',
    apiId: '135',
    unibet: 'football/italy/serie_a',
    group: 1000095001,
  },
  F1: {
    name: 'Ligue 1',
    country: 'Frankrijk',
    file: 'fr',
    timezone: 'Europe/Paris',
    espn: 'fra.1',
    apiId: '61',
    unibet: 'football/france/ligue_1',
    group: 1000094991,
  },
} as const;
export type Division = keyof typeof competitions;
export const divisions = Object.keys(competitions) as Division[];
export function competitionLeague(division: Division): League {
  const c = competitions[division];
  return {
    id: `free-league-${division.toLowerCase()}`,
    name: c.name,
    country: c.country,
    logo: null,
    refs: [{ provider: 'free-football', externalId: division }],
  };
}
export function fixtureDivision(fixture: Fixture): Division {
  return (
    divisions.find((d) =>
      fixture.league.refs.some((r) => r.externalId === d || r.externalId === competitions[d].apiId),
    ) ?? 'E0'
  );
}
export const italianClubs: Record<string, string[]> = {
  'AC Milan': ['Milan'],
  Roma: ['AS Roma'],
  Atalanta: ['Atalanta BC'],
  Bologna: ['Bologna FC 1909'],
  Cagliari: ['Cagliari Calcio'],
  Como: ['Como 1907'],
  Fiorentina: ['ACF Fiorentina'],
  Frosinone: ['Frosinone Calcio'],
  Genoa: ['Genoa CFC'],
  Inter: ['Internazionale', 'FC Internazionale Milano', 'Inter Milan'],
  Juventus: ['Juventus FC'],
  Lazio: ['SS Lazio'],
  Lecce: ['US Lecce'],
  Monza: ['AC Monza'],
  Napoli: ['SSC Napoli'],
  Parma: ['Parma Calcio 1913'],
  Sassuolo: ['US Sassuolo Calcio'],
  Torino: ['Torino FC'],
  Udinese: ['Udinese Calcio'],
  Venezia: ['Venezia FC'],
  Cremonese: ['US Cremonese'],
  Empoli: ['Empoli FC'],
  Salernitana: ['US Salernitana 1919'],
  Sampdoria: ['UC Sampdoria'],
  Spezia: ['Spezia Calcio'],
  Verona: ['Hellas Verona', 'Hellas Verona FC'],
  Pisa: ['Pisa SC'],
};
export const frenchClubs: Record<string, string[]> = {
  Auxerre: ['AJ Auxerre'],
  Monaco: ['AS Monaco', 'AS Monaco FC'],
  Angers: ['Angers SCO'],
  Brest: ['Stade Brestois 29'],
  'Le Havre': ['Le Havre AC'],
  'Le Mans': ['Le Mans FC'],
  Lens: ['Racing Club de Lens', 'RC Lens'],
  Lille: ['Lille OSC'],
  Lorient: ['FC Lorient'],
  Lyon: ['Olympique Lyonnais'],
  Marseille: ['Olympique de Marseille'],
  Nice: ['OGC Nice'],
  'Paris FC': [],
  PSG: ['Paris Saint-Germain', 'Paris Saint-Germain FC', 'Paris SG'],
  Rennes: ['Stade Rennais', 'Stade Rennais FC 1901', 'Stade Rennais FC'],
  Strasbourg: ['RC Strasbourg Alsace'],
  Toulouse: ['Toulouse FC'],
  Troyes: ['ES Troyes AC'],
  Ajaccio: ['AC Ajaccio'],
  Clermont: ['Clermont Foot', 'Clermont Foot 63'],
  Metz: ['FC Metz'],
  Montpellier: ['Montpellier Hérault SC'],
  Nantes: ['FC Nantes'],
  Reims: ['Stade de Reims'],
  'Saint-Etienne': ['Saint-Étienne', 'AS Saint-Étienne', 'St Etienne'],
};
export const additionalClubs = { ...italianClubs, ...frenchClubs };
export const additionalClubName = (name: string) =>
  Object.keys(additionalClubs).find(
    (k) => k === name.trim() || additionalClubs[k].includes(name.trim()),
  ) ?? null;
