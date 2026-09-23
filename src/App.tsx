import { tr, t, useLanguage, setLanguage } from './i18n';
import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  ChevronRight,
  CircleHelp,
  Info,
  Layers3,
  LayoutDashboard,
  Trophy,
  X,
} from 'lucide-react';
import { isDemo } from './api';
import Dashboard from './components/Dashboard';
import { analysisWeights as w } from './analysis/config';
const MatchPage = lazy(() => import('./components/MatchPage'));
const CombinationsPage = lazy(() => import('./components/CombinationsPage'));
const MatchPicker = lazy(() => import('./components/MatchPicker'));
function Modal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-title"
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-button close" onClick={onClose} aria-label={t('Sluiten')} autoFocus>
          <X size={20} />
        </button>
        <div className="eyebrow">{t('TRANSPARANT VANAF DE AFTRAP')}</div>
        <h2 id="model-title">{t('De data achter de kansen.')}</h2>
        <p>
          {t(
            'Matchday berekent zelf trends en modelkansen uit historische wedstrijden. We gebruiken geen prediction-endpoints, odds of machine learning.',
          )}
        </p>
        <div className="weight-list">
          {[
            ['Laatste 5 wedstrijden', w.recent5.toFixed(2)],
            ['Wedstrijden 6–10', w.recent10.toFixed(2)],
            ['Wedstrijden 11–20', w.recent20.toFixed(2)],
            ['Relevante thuis/uitwedstrijd', `× ${w.homeAway.toFixed(2)}`],
            ['Recente H2H', w.h2hRecent.toFixed(2)],
            [tr('H2H-gewicht halveert elke {0} dagen', [w.h2hHalfLifeDays]), '× 0.5'],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{t(k)}</span>
              <strong>{t(v)}</strong>
            </div>
          ))}
        </div>
        <p>
          {t(
            'Gedeelde duels tellen één keer mee. Goalmarkten gebruiken gewogen frequenties met een Beta(1,1)-prior. De 1/X/2-kansen komen uit een Poisson-model met gewogen goals voor en tegen.',
          )}
        </p>
        <div className="notice">
          <Info size={18} />
          <span>
            {t(
              'Deze kansen zijn ongekalibreerde modelinschattingen, geen zekerheid. De confidence beschrijft de hoeveelheid data, niet bewezen voorspelkracht.',
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = 'Matchday — Football Intelligence';
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        language === 'en'
          ? 'Matchday — transparent football analysis based on historical match data.'
          : 'Matchday — transparante voetbalanalyse op basis van historische wedstrijddata.',
      );
  }, [language]);
  const [route, setRoute] = useState(window.location.pathname);
  const [method, setMethod] = useState(false);
  useEffect(() => {
    const listener = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);
  useEffect(() => {
    if (!method) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMethod(false);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [method]);
  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(path);
    window.scrollTo(0, 0);
  };
  const matchId = route.startsWith('/match/') ? decodeURIComponent(route.slice(7)) : null;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          {t('matchday')}
          <span className="brand-dot">{'.'}</span>
        </a>
        <div className="workspace-label">{t('FOOTBALL INTELLIGENCE')}</div>
        <nav>
          <button
            aria-label={t('Wedstrijden')}
            aria-current={route === '/' ? 'page' : undefined}
            className={route === '/' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('/')}
          >
            <LayoutDashboard size={19} />
            {t('Wedstrijden')}
            <span className="nav-count">{'01'}</span>
          </button>
          <button
            aria-label={t('Matchanalyse')}
            aria-current={matchId || route === '/analyse' ? 'page' : undefined}
            className={matchId || route === '/analyse' ? 'nav-item active' : 'nav-item'}
            onClick={() =>
              matchId ? window.scrollTo({ top: 0, behavior: 'smooth' }) : navigate('/analyse')
            }
          >
            <BarChart3 size={19} />
            <span className="nav-label">{t('Matchanalyse')}</span>
            <span className="nav-mobile-label">{t('Analyse')}</span>
          </button>
          <button
            aria-label={t('Combivoorstellen')}
            aria-current={route === '/combis' ? 'page' : undefined}
            className={route === '/combis' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('/combis')}
          >
            <Layers3 size={19} />
            <span className="nav-label">{t('Combivoorstellen')}</span>
            <span className="nav-mobile-label">{t('Combi’s')}</span>
          </button>
          <button
            className="nav-item"
            aria-label={t('Ons model')}
            aria-haspopup="dialog"
            onClick={() => setMethod(true)}
          >
            <Layers3 size={19} />
            <span className="nav-label">{t('Ons model')}</span>
            <span className="nav-mobile-label">{t('Model')}</span>
            <ArrowDownRight size={15} className="nav-end" />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">{t('COMPETITIES')}</div>
        <div className="league-nav">
          <Trophy size={17} />
          <span>{t('Premier League')}</span>
          <span className="green-dot" />
        </div>
        {!isDemo &&
          ['La Liga', 'Serie A', 'Ligue 1', 'Bundesliga'].map((name) => (
            <div className="league-nav" key={name}>
              <Trophy size={17} />
              <span>{t(name)}</span>
              <span className="green-dot" />
            </div>
          ))}
        <div className="sidebar-bottom">
          <div className="engine-card">
            <span className="engine-icon">
              <Activity size={18} />
            </span>
            <strong>{t('Data. Geen giswerk.')}</strong>
            <p>
              {t('Elke kans heeft een verhaal.')}
              <br />
              {t('Ontdek hoe we rekenen.')}
            </p>
            <button onClick={() => setMethod(true)}>
              {t('Bekijk ons model ')}
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="source-status">
            <span className="green-dot" />
            {t(isDemo ? 'Demo-omgeving' : 'Databronnen via server')}
            <span>{t('v1.0')}</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            {t('Workspace ')}
            <ChevronRight size={14} />
            <strong>
              {t(
                matchId || route === '/analyse'
                  ? 'Matchanalyse'
                  : route === '/combis'
                    ? 'Combivoorstellen'
                    : 'Wedstrijden',
              )}
            </strong>
          </div>
          <div className="topbar-right">
            <label className="language-control">
              <span className="sr-only">{language === 'en' ? 'Language' : 'Taal'}</span>
              <select
                aria-label={language === 'en' ? 'Language' : 'Taal'}
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'nl' | 'en')}
              >
                <option value="nl">NL</option>
                <option value="en">EN</option>
              </select>
            </label>
            <span className="data-label">
              <span className="green-dot" />
              {t(isDemo ? 'Voorbeelddata' : 'Historische data')}
            </span>
            <button
              className="icon-button"
              aria-label={t('Hoe werkt het model?')}
              onClick={() => setMethod(true)}
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar">{t('MD')}</span>
          </div>
        </header>
        <main>
          {matchId ? (
            <Suspense fallback={<p role="status">{t('Pagina laden…')}</p>}>
              <MatchPage id={matchId} navigate={navigate} showModel={() => setMethod(true)} />
            </Suspense>
          ) : route === '/analyse' ? (
            <Suspense fallback={<p role="status">{t('Pagina laden…')}</p>}>
              <MatchPicker navigate={navigate} />
            </Suspense>
          ) : route === '/combis' ? (
            <Suspense fallback={<p role="status">{t('Pagina laden…')}</p>}>
              <CombinationsPage navigate={navigate} />
            </Suspense>
          ) : (
            <Dashboard navigate={navigate} />
          )}
        </main>
        <footer>
          <span>
            {t('matchday')}
            <span className="brand-dot">{'.'}</span>{' '}
            <span className="footer-text">{t('Meer inzicht. Beter voorbereid.')}</span>
          </span>
          <span>
            {t('Modelinschattingen zijn geen zekerheid.')}{' '}
            <a href="/clubs/CREDITS.md" target="_blank" rel="noreferrer">
              {t('Clublogo’s: bron en rechten')}
            </a>
          </span>
        </footer>
      </div>
      {method && <Modal onClose={() => setMethod(false)} />}
    </div>
  );
}
