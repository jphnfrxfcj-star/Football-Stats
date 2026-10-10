import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Retain React and native details state without duplicate IDs in the document. */
export default function RetainedPage({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [container] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    if (active) host.current?.appendChild(container);
    return () => container.remove();
  }, [active, container]);
  return (
    <>
      <div ref={host} hidden={!active} />
      {createPortal(children, container)}
    </>
  );
}
