import { useEffect } from 'react';

let activeLocks = 0;

/**
 * Prevents the document behind a modal or full-screen surface from moving.
 * The counter keeps nested overlays from unlocking each other prematurely.
 */
export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return undefined;

    activeLocks += 1;
    document.body.classList.add('app-scroll-locked');

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) document.body.classList.remove('app-scroll-locked');
    };
  }, [locked]);
}
