'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SECTIONS, sectionById } from '@/lib/registry';
import { initFrames, setActive } from '@/lib/client/frames';
import { useStore } from '@/lib/client/store';
import { Icon } from './Icon';
import { TopBar } from './TopBar';
import { SyncBar } from './SyncBar';

const lastTab: Record<string, string> = {};

/** The signed-in application: the department list on the left, the top bar, and either an app or a page in the middle. */
export function Chrome({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const user = useStore((s) => s.auth.user);
  const loaded = useStore((s) => s.frames.loaded);
  const ready = useStore((s) => s.frames.ready);
  const hostRef = useRef<HTMLDivElement>(null);

  const parts = pathname.split('/').filter(Boolean);
  const section = parts[0] === 'd' ? sectionById(parts[1]) : undefined;
  const appKey = section ? (section.tabs.some((t) => t[0] === parts[2]) ? parts[2] : lastTab[section.id] ?? section.tabs[0][0]) : null;
  const tabLabel = section?.tabs.find((t) => t[0] === appKey)?.[1];

  useEffect(() => { if (hostRef.current) initFrames(hostRef.current); }, []);
  useEffect(() => {
    if (section && appKey) lastTab[section.id] = appKey;
    setActive(appKey);
  }, [section, appKey]);
  useEffect(() => { setNavOpen(false); }, [pathname]);
  useEffect(() => {
    document.title = (tabLabel ? tabLabel + ' · ' : section ? section.title + ' · ' : '') + 'Ferentino Management System';
  }, [section, tabLabel]);

  const loadingApp = !!appKey && !!loaded[appKey] && !ready[appKey];

  return (
    <div className="app" style={{ ['--accent' as string]: section?.color ?? '#da1b22' }}>
      <aside className={'sidebar' + (navOpen ? ' open' : '')} aria-label="Departments">
        <div className="side-head">
          <Link href="/" aria-label="Home"><img src="/logo.jpg" alt="Ferentino" /></Link>
          <small>Management system</small>
        </div>
        <nav className="side-nav">
          <Link href="/" className={'nav-link' + (pathname === '/' ? ' on' : '')}>
            <span className="nav-ico"><Icon name="home" size={16} /></span><span className="t">Home</span>
          </Link>
          <div className="side-label">Departments</div>
          {SECTIONS.map((s) => (
            <Link key={s.id} href={`/d/${s.id}/${lastTab[s.id] ?? s.tabs[0][0]}`} className={'nav-link' + (section?.id === s.id ? ' on' : '')} style={{ ['--dot' as string]: s.color }}>
              <span className="nav-ico"><Icon name={s.icon} size={16} /></span><span className="t">{s.title}</span>
            </Link>
          ))}
          <Link href="/stores/receive" className={'nav-link' + (pathname.startsWith('/stores') ? ' on' : '')} style={{ ['--dot' as string]: '#CA8A04' }}>
            <span className="nav-ico"><Icon name="box" size={16} /></span><span className="t">Stores Department</span>
          </Link>
          <div className="side-label">Records</div>
          <Link href="/signatures" className={'nav-link' + (pathname.startsWith('/signatures') ? ' on' : '')}>
            <span className="nav-ico"><Icon name="sign" size={16} /></span><span className="t">Signature log</span>
          </Link>
          {user?.role === 'admin' && (
            <>
              <div className="side-label">Administration</div>
              <Link href="/admin/people" className={'nav-link' + (pathname.startsWith('/admin/people') ? ' on' : '')}><span className="nav-ico"><Icon name="users" size={16} /></span><span className="t">People and passwords</span></Link>
              <Link href="/admin/audit" className={'nav-link' + (pathname.startsWith('/admin/audit') ? ' on' : '')}><span className="nav-ico"><Icon name="list" size={16} /></span><span className="t">Audit log</span></Link>
              <Link href="/admin/data" className={'nav-link' + (pathname.startsWith('/admin/data') ? ' on' : '')}><span className="nav-ico"><Icon name="db" size={16} /></span><span className="t">Stored data</span></Link>
            </>
          )}
        </nav>
        <div className="side-foot">Ferentino Industrial Tyres (Pvt) Ltd</div>
      </aside>
      <div className={'scrim' + (navOpen ? ' open' : '')} onClick={() => setNavOpen(false)} />

      <div className="main">
        <TopBar section={section} tabLabel={tabLabel} pathname={pathname} onMenu={() => setNavOpen(true)} />
        <SyncBar />
        {section && (
          <nav className="tabs" aria-label={section.title}>
            {section.tabs.map(([key, label]) => (
              <Link key={key} href={`/d/${section.id}/${key}`} className={'tab' + (key === appKey ? ' on' : '')} aria-current={key === appKey ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
        )}
        <div className="content">
          <div className="stage" hidden={!section}>
            <div ref={hostRef} className="frame-slot" />
            {loadingApp && <div className="stage-loading"><div><div className="spin" /><div>Loading…</div></div></div>}
          </div>
          {!section && <div className="page"><div className="page-in">{children}</div></div>}
        </div>
      </div>
    </div>
  );
}
