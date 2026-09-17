import type { DataAvailability } from '../domain/models';
import { t, tr, locale } from '../i18n';
export default function DataNotice({ items }: { items: (DataAvailability | undefined)[] }) {
  const groups = new Map<string, DataAvailability>();
  for (const item of items) {
    if (!item) continue;
    const key = `${item.status}:${item.source}`;
    const previous = groups.get(key);
    if (!previous || !item.updatedAt || (previous.updatedAt && item.updatedAt < previous.updatedAt))
      groups.set(key, item);
  }
  if (!groups.size) return null;
  return (
    <div className="data-notice" role="status">
      {[...groups].map(([key, item]) => (
        <p key={key}>
          {t(
            item.status === 'partial'
              ? 'Historie kon niet volledig worden vernieuwd. Opgeslagen gegevens en beschikbare uitslagen worden getoond; automatische combivoorstellen zijn uitgeschakeld.'
              : item.status === 'stale'
                ? 'De databron is niet bereikbaar. Dit zijn eerder opgeslagen gegevens; aftrappen en uitslagen kunnen gewijzigd zijn.'
                : 'Een databron is tijdelijk niet beschikbaar. De gegevens worden via een alternatieve bron geladen.',
          )}{' '}
          {tr('Bron: {0}. Laatste beschikbare update: {1}.', [
            t(item.source),
            item.updatedAt ? new Date(item.updatedAt).toLocaleString(locale()) : t('onbekend'),
          ])}
        </p>
      ))}
    </div>
  );
}
