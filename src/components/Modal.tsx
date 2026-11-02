'use client';

import { useEffect } from 'react';

/** A centred dialog. Escape or a click on the dark area closes it (when onClose is given). */
export function Modal({ title, sub, children, onClose, wide }: { title: string; sub?: string; children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    if (!onClose) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}
