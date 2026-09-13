import { useEffect, useState } from 'react';
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
import MatchPage from './components/MatchPage';
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
        <button className="icon-button close" onClick={onClose} aria-label="Sluiten" autoFocus>
          <X size={20} />
        </button>
        <div className="eyebrow">TRANSPARANT VANAF DE AFTRAP</div>
        <h2 id="model-title">De data achter de kansen.</h2>
        <p>
          Matchday berekent zelf trends en modelkansen uit historische wedstrijden. We gebruiken
          geen prediction-endpoints, odds of machine learning.
        </p>
        <div className="weight-list">
          {[
            ['Laatste 5 wedstrijden', w.recent5.toFixed(2)],
            ['Wedstrijden 6–10', w.recent10.toFixed(2)],
            ['Wedstrijden 11–20', w.recent20.toFixed(2)],
            ['Relevante thuis/uitwedstrijd', `× ${w.homeAway.toFixed(2)}`],
            ['Recente H2H', w.h2hRecent.toFixed(2)],
            [`H2H ouder dan ${w.oldH2HDays} dagen`, w.h2hOld.toFixed(2)],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <p>
          Gedeelde duels tellen één keer mee. Goalmarkten gebruiken gewogen frequenties met een
          Beta(1,1)-prior. De 1/X/2-kansen komen uit een Poisson-model met gewogen goals voor en
          tegen.
        </p>
        <div className="notice">
          <Info size={18} />
          <span>
            Deze kansen zijn ongekalibreerde modelinschattingen, geen zekerheid. De confidence
            beschrijft de hoeveelheid data, niet bewezen voorspelkracht.
          </span>
        </div>
      </div>
    </div>
  );
}
export default function App() {
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
          matchday<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">FOOTBALL INTELLIGENCE</div>
        <nav>
          <button
            className={!matchId ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('/')}
          >
            <LayoutDashboard size={19} />
            Wedstrijden<span className="nav-count">01</span>
          </button>
          <button
            className={matchId ? 'nav-item active' : 'nav-item'}
            onClick={() =>
              matchId ? window.scrollTo({ top: 0, behavior: 'smooth' }) : setMethod(true)
            }
          >
            <BarChart3 size={19} />
            Matchanalyse
          </button>
          <button className="nav-item" onClick={() => setMethod(true)}>
            <Layers3 size={19} />
            Ons model
            <ArrowDownRight size={15} className="nav-end" />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">COMPETITIES</div>
        <div className="league-nav">
          <Trophy size={17} />
          <span>Premier League</span>
          <span className="green-dot" />
        </div>
        {!isDemo && (
          <div className="league-nav">
            <Trophy size={17} />
            <span>La Liga</span>
            <span className="green-dot" />
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="engine-card">
            <span className="engine-icon">
              <Activity size={18} />
            </span>
            <strong>Data. Geen giswerk.</strong>
            <p>
              Elke kans heeft een verhaal.
              <br />
              Ontdek hoe we rekenen.
            </p>
            <button onClick={() => setMethod(true)}>
              Bekijk ons model <ArrowRight size={15} />
            </button>
          </div>
          <div className="source-status">
            <span className="green-dot" />
            {isDemo ? 'Demo-omgeving' : 'Databronnen via server'}
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{matchId ? 'Matchanalyse' : 'Wedstrijden'}</strong>
          </div>
          <div className="topbar-right">
            <span className="data-label">
              <span className="green-dot" />
              {isDemo ? 'Voorbeelddata' : 'Historische data'}
            </span>
            <button
              className="icon-button"
              aria-label="Hoe werkt het model?"
              onClick={() => setMethod(true)}
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar">MD</span>
          </div>
        </header>
        <main>
          {matchId ? (
            <MatchPage id={matchId} navigate={navigate} showModel={() => setMethod(true)} />
          ) : (
            <Dashboard navigate={navigate} />
          )}
        </main>
        <footer>
          <span>
            matchday<span className="brand-dot">.</span>{' '}
            <span className="footer-text">Meer inzicht. Beter voorbereid.</span>
          </span>
          <span>
            Modelinschattingen zijn geen zekerheid.{' '}
            <a href="/clubs/CREDITS.md" target="_blank" rel="noreferrer">
              Clublogo’s: bron en rechten
            </a>
          </span>
        </footer>
      </div>
      {method && <Modal onClose={() => setMethod(false)} />}
    </div>
  );
}
