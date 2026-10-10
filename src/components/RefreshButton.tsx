import { RefreshCw } from 'lucide-react';
import { t } from '../i18n';

export default function RefreshButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-button refresh-button"
      aria-label={t(label)}
      title={t(loading ? 'Bijwerken…' : label)}
      aria-busy={loading}
      disabled={loading}
      onClick={onClick}
    >
      <RefreshCw size={16} aria-hidden="true" />
    </button>
  );
}
