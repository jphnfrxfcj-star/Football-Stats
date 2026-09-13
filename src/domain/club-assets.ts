import { spanishLogos } from './spanish-logos';
// Identification assets; source and rights notice: public/clubs/CREDITS.md.
const clubIds: Record<string, number> = {
  Arsenal: 42,
  'Aston Villa': 66,
  Bournemouth: 35,
  Brentford: 55,
  Brighton: 51,
  Burnley: 44,
  Chelsea: 49,
  Coventry: 1346,
  'Crystal Palace': 52,
  Everton: 45,
  Fulham: 36,
  Hull: 64,
  Ipswich: 57,
  Leeds: 63,
  Leicester: 46,
  Liverpool: 40,
  Luton: 1359,
  'Manchester City': 50,
  'Manchester United': 33,
  Newcastle: 34,
  'Nottingham Forest': 65,
  'Sheffield United': 62,
  Southampton: 41,
  Sunderland: 746,
  Tottenham: 47,
  Watford: 38,
  'West Brom': 60,
  'West Ham': 48,
  Wolves: 39,
  Norwich: 71,
};

export function clubLogo(name: string): string | null {
  if (spanishLogos[name]) return spanishLogos[name];
  const id = clubIds[name];
  return id ? `/clubs/${id}.v1.png` : null;
}
