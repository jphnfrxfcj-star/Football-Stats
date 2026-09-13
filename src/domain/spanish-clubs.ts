/** Reviewed source aliases shared by schedules, CSV, ESPN and bookmaker matching. */
export const spanishClubs: Record<string, string[]> = {
  Alaves: ['Alavés', 'Deportivo Alavés', 'Deportivo Alaves'],
  'Athletic Bilbao': ['Ath Bilbao', 'Athletic Club', 'Athletic Club Bilbao'],
  'Atletico Madrid': [
    'Ath Madrid',
    'Atlético Madrid',
    'Atlético de Madrid',
    'Club Atlético de Madrid',
    'Atletico de Madrid',
  ],
  Barcelona: ['FC Barcelona'],
  Betis: ['Real Betis', 'Real Betis Balompié'],
  Celta: ['Celta Vigo', 'Celta de Vigo', 'RC Celta de Vigo'],
  Espanyol: ['Espanol', 'RCD Espanyol', 'RCD Espanyol de Barcelona'],
  Getafe: ['Getafe CF'],
  Osasuna: ['CA Osasuna'],
  'Rayo Vallecano': ['Vallecano', 'Rayo Vallecano de Madrid'],
  'Real Madrid': ['Real Madrid CF'],
  'Real Sociedad': ['Sociedad', 'Real Sociedad de Fútbol'],
  Sevilla: ['Sevilla FC'],
  Valencia: ['Valencia CF'],
  Villarreal: ['Villarreal CF'],
  Elche: ['Elche CF'],
  Levante: ['Levante UD'],
  Malaga: ['Málaga', 'Málaga CF', 'Malaga CF'],
  'Deportivo La Coruna': [
    'La Coruna',
    'Deportivo',
    'Deportivo A Coruña',
    'Deportivo La Coruña',
    'RC Deportivo La Coruña',
    'Deportivo La Coruna',
  ],
  'Racing Santander': ['Santander', 'Racing de Santander', 'Real Racing Club de Santander'],
  Girona: ['Girona FC'],
  Mallorca: ['RCD Mallorca'],
  Oviedo: ['Real Oviedo'],
  'Las Palmas': ['UD Las Palmas'],
  Leganes: ['Leganés', 'CD Leganés'],
  Valladolid: ['Real Valladolid', 'Real Valladolid CF'],
  Almeria: ['Almería', 'UD Almería'],
  Cadiz: ['Cádiz', 'Cádiz CF'],
  Granada: ['Granada CF'],
};
export const spanishClubName = (name: string) =>
  Object.keys(spanishClubs).find((k) => k === name || spanishClubs[k].includes(name.trim())) ??
  null;
export const spanishSlug = (name: string) => name.toLowerCase().replaceAll(' ', '-');
