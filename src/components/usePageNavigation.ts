import { useLayoutEffect, useRef, useState } from 'react';

// Keep the overview screens and at most five recent match screens in this tab.
export function usePageNavigation() {
  const [route, setRoute] = useState(window.location.pathname);
  const [pages, setPages] = useState([route]);
  const positions = useRef(new Map<string, number>());
  const entry = useRef(crypto.randomUUID());
  const destination = useRef<number | null>(0);
  const origins = useRef(new Map<string, { path: string; entry: string }>());
  const [visit, setVisit] = useState(0);

  const show = (path: string) => {
    setPages((previous) => {
      const ordered = [...previous.filter((p) => p !== path), path];
      const matches = ordered.filter((p) => p.startsWith('/match/')).slice(-5);
      return ordered.filter((p) => !p.startsWith('/match/') || matches.includes(p));
    });
    setRoute(path);
    setVisit((n) => n + 1);
  };

  useLayoutEffect(() => {
    window.history.replaceState({ ...window.history.state, matchdayEntry: entry.current }, '');
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const pop = () => {
      positions.current.set(entry.current, window.scrollY);
      entry.current = window.history.state?.matchdayEntry ?? crypto.randomUUID();
      // Native section links also create entries. Give them a stable identity so
      // a later Back/Forward visit can restore where the reader left that section.
      window.history.replaceState({ ...window.history.state, matchdayEntry: entry.current }, '');
      destination.current =
        positions.current.get(entry.current) ?? (window.location.hash ? null : 0);
      show(window.location.pathname);
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    // A new anchor entry has no saved position; let the browser reach its target.
    if (destination.current !== null) window.scrollTo(0, destination.current);
  }, [visit]);

  const navigate = (path: string) => {
    if (path === route) return;
    positions.current.set(entry.current, window.scrollY);
    if (path.startsWith('/match/')) {
      origins.current.delete(path);
      origins.current.set(path, { path: route, entry: entry.current });
      while (origins.current.size > 5) origins.current.delete(origins.current.keys().next().value!);
    }
    entry.current = crypto.randomUUID();
    window.history.pushState({ matchdayEntry: entry.current, matchdayFrom: route }, '', path);
    destination.current = 0;
    show(path);
  };
  const back = () => {
    const origin = origins.current.get(route);
    if (window.history.state?.matchdayFrom && !window.location.hash) window.history.back();
    else {
      // Native section links create history entries too; return to the source overview.
      navigate(origin?.path ?? '/analyse');
      destination.current = origin ? (positions.current.get(origin.entry) ?? 0) : 0;
    }
  };
  return { route, pages, navigate, back };
}
