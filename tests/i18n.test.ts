import { afterEach, expect, it } from 'vitest';
import { t, tr, setLanguage, locale } from '../src/i18n';
afterEach(() => setLanguage('nl'));
it('defaults to Dutch and translates presentation without changing identities or data', () => {
  setLanguage('nl');
  expect(t('Wedstrijden')).toBe('Wedstrijden');
  expect(locale()).toBe('nl-BE');
  const quote = { bookmaker: 'Unibet België', decimal: 2.5 };
  setLanguage('en');
  expect(t('Wedstrijden')).toBe('Matches');
  expect(locale()).toBe('en-GB');
  expect(t(quote)).toBe(quote);
  expect(quote.bookmaker).toBe('Unibet België');
  expect(t(2.5)).toBe(2.5);
  expect(t('Arsenal')).toBe('Arsenal');
  expect(t('constructor')).toBe('constructor');
  expect(t(' Thuis ')).toBe(' Home ');
});
it('translates source messages, historical trends and explicit interpolations', () => {
  setLanguage('en');
  expect(
    t('Geen Unibet-prijzen beschikbaar voor deze wedstrijd. Je bekijkt de prijzen van bet365.'),
  ).toBe('No Unibet prices are available for this match. You are viewing prices from bet365.');
  expect(t('Arsenal: Beide teams scoren in 4 van de laatste 5 wedstrijden.')).toBe(
    'Arsenal: Both teams to score in 4 of the last 5 matches.',
  );
  expect(tr('Quotering {0}{1}', ['12 Sept 2026', ' · verouderd'])).toBe(
    'Odds updated 12 Sept 2026 · outdated',
  );
  expect(
    t(
      'Supabase weigert de serversleutel of databasepermissies. Controleer SUPABASE_SERVICE_ROLE_KEY in Netlify Functions.',
    ),
  ).toContain('Supabase rejected');
});
