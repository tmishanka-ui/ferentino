'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { SECTIONS } from '@/lib/registry';
import { useStore, toast } from '@/lib/client/store';
import { downloadBackup, restoreBackup } from '@/lib/client/backup';
import { Icon } from '@/components/Icon';

export default function Home() {
  const user = useStore((s) => s.auth.user);
  const file = useRef<HTMLInputElement>(null);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="hello">
        <h2>{greet}{user ? `, ${user.name.split(' ')[0]}` : ''}.</h2>
        <p>Quality control dashboards and the shop-floor working apps, together in one place. Choose a department to begin.</p>
      </div>

      <div className="cards">
        {SECTIONS.map((s) => (
          <Link key={s.id} href={`/d/${s.id}`} className="card" style={{ ['--c' as string]: s.color }}>
            <span className="ico"><Icon name={s.icon} size={22} /></span>
            <h3>{s.title}</h3>
            <p>{s.blurb}</p>
            <span className="meta"><span>{s.tabs.length} {s.tabs.length === 1 ? 'app' : 'apps'}</span><Icon name="arrow" size={16} /></span>
          </Link>
        ))}
      </div>

      <div className="panel">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3>Backup of the whole system</h3>
          <p>One file holds everything in all departments. Download it regularly; upload it to restore or to move to another computer.</p>
        </div>
        <div className="row" style={{ margin: 0 }}>
          <button className="btn" onClick={() => downloadBackup(toast)}><Icon name="download" size={16} />Download backup</button>
          <button className="btn" onClick={() => { if (file.current) { file.current.value = ''; file.current.click(); } }}><Icon name="upload" size={16} />Upload backup</button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f, toast); }} />
        </div>
      </div>
    </>
  );
}
