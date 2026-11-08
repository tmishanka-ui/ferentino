'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: [string, string][] = [['receive', 'Receive'], ['issue', 'Issue'], ['stock', 'Stock'], ['movements', 'Movements'], ['backup', 'Backup']];

export default function StoresLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname.split('/')[2] || 'receive';

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Stores Department</h2>
          <p>Receive items into the ledger, print a QR label, and scan it to issue — the balance always updates on its own.</p>
        </div>
      </div>
      <nav className="tabs-inline" aria-label="Stores">
        {TABS.map(([key, label]) => <Link key={key} href={`/stores/${key}`} className={current === key ? 'on' : ''}>{label}</Link>)}
      </nav>
      {children}
    </>
  );
}
