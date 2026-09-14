import { additionalClubName } from './competitions';
import { spanishClubName } from './spanish-clubs';
import { clubLogo } from './club-assets';
const aliases: Record<string, string> = {
  'AFC Bournemouth': 'Bournemouth',
  'Brighton & Hove Albion': 'Brighton',
  'Brighton and Hove Albion': 'Brighton',
  'Coventry City': 'Coventry',
  'Hull City': 'Hull',
  'Ipswich Town': 'Ipswich',
  'Leeds United': 'Leeds',
  'Leicester City': 'Leicester',
  'Luton Town': 'Luton',
  'Man City': 'Manchester City',
  'Man United': 'Manchester United',
  'Newcastle United': 'Newcastle',
  'Norwich City': 'Norwich',
  "Nott'm Forest": 'Nottingham Forest',
  'Tottenham Hotspur': 'Tottenham',
  'West Bromwich Albion': 'West Brom',
  'West Ham United': 'West Ham',
  'Wolverhampton Wanderers': 'Wolves',
};
/** Reviewed names only: never fuzzy-match an odds market or player to another club. */
export function canonicalClubName(name: string): string | null {
  const additional = additionalClubName(name);
  if (additional) return additional;
  const spanish = spanishClubName(name);
  if (spanish) return spanish;
  const stripped = name.trim().replace(/ (FC|AFC)$/, '');
  const canonical = aliases[stripped] ?? stripped;
  return clubLogo(canonical) ? canonical : null;
}
