'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Section } from '@/lib/registry';
import { useStore, toast } from '@/lib/client/store';
import { signOut } from '@/lib/client/auth';
import { downloadBackup, restoreBackup } from '@/lib/client/backup';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { PasswordForm } from './PasswordForm';

const PAGE_TITLES: Record<string, [string, string]> = {
  '/': ['Home', 'Choose a department'],
  '/signatures': ['Signature log', 'Documents signed with a password'],
  '/admin/people': ['People and passwords', 'Administrator'],
  '/admin/audit': ['Audit log', 'Administrator'],
  '/admin/data': ['Stored data', 'Administrator'],
  '/stores/receive': ['Stores Department', 'Receive'],
  '/stores/issue': ['Stores Department', 'Issue'],
  '/stores/stock': ['Stores Department', 'Stock'],
  '/stores/movements': ['Stores Department', 'Movements'],
  '/stores/backup': ['Stores Department', 'Backup'],
};

export function TopBar({ section, tabLabel, pathname, onMenu }: { section?: Section; tabLabel?: string; pathname: string; onMenu: () => void }) {
  const chip = useStore((s) => s.sync.chip);
  const [title, subtitle] = section ? [section.title, tabLabel ?? ''] : PAGE_TITLES[pathname] ?? ['Ferentino', ''];
  return (
    <header className="topbar">
      <button className="btn ghost burger" onClick={onMenu} aria-label="Open the department list"><Icon name="menu" /></button>
      <div className="crumb">
        <h1>{section && <span className="dot" />}{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="spacer" />
      {chip.tone !== 'hidden' && <span className={'chip ' + chip.tone} role="status">{chip.text}</span>}
      <UserMenu />
    </header>
  );
}

function UserMenu() {
  const user = useStore((s) => s.auth.user);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [pw, setPw] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu, .user-btn')) setPos(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [pos]);

  if (!user) return null;
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    setPos(pos ? null : { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  };

  return (
    <>
      <button ref={btn} className="user-btn" onClick={open} aria-haspopup="menu" aria-expanded={!!pos} title={`${user.name} — ${user.designation}`}>
        <span className="avatar">{initials}</span><b>{user.name.split(' ')[0]}</b><Icon name="chevron" size={14} />
      </button>
      {pos && (
        <div className="menu" style={{ top: pos.top, right: pos.right }} role="menu">
          <div className="who"><b>{user.name}</b><span>{user.designation || user.role}{user.department ? ' · ' + user.department : ''}</span></div>
          <button onClick={() => { setPos(null); setPw(true); }}>Change password</button>
          <Link href="/signatures" onClick={() => setPos(null)}>Signature log</Link>
          {user.role === 'admin' && <Link href="/admin/people" onClick={() => setPos(null)}>People and passwords</Link>}
          <hr />
          <button onClick={() => { setPos(null); downloadBackup(toast); }}>Download backup<small>Everything in all departments, as one file</small></button>
          <button onClick={() => { setPos(null); if (file.current) { file.current.value = ''; file.current.click(); } }}>Upload backup…<small>Restore from a backup file; replaces the saved data</small></button>
          <hr />
          <button onClick={() => { setPos(null); signOut(); }}>Sign out</button>
        </div>
      )}
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f, toast); }} />
      {pw && <Modal title="Change password" onClose={() => setPw(false)}><PasswordForm onDone={() => { setPw(false); toast('Your password was changed.'); }} onCancel={() => setPw(false)} /></Modal>}
    </>
  );
}
