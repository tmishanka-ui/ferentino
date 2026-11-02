'use client';

import { useStore } from '@/lib/client/store';
import { itemName } from '@/lib/registry';
import { keepMine, reloadToSee, takeTheirs } from '@/lib/client/sync';

/** Appears when somebody else saved a page, or when this person's save was refused because a newer version exists. */
export function SyncBar() {
  const conflicts = useStore((s) => s.sync.conflicts);
  const remote = useStore((s) => s.sync.remote);
  if (!conflicts.length && !remote.length) return null;
  const by = [...new Set(remote.map((r) => r.by).filter(Boolean))];
  return (
    <div className="syncbar" role="alert">
      {conflicts.length > 0 && (
        <div>
          <span><b>Not saved:</b> {conflicts.map(itemName).join(', ')} — somebody else saved a newer version first.</span>
          <button className="btn sm" onClick={takeTheirs}>Use their version</button>
          <button className="btn sm" onClick={keepMine}>Keep mine</button>
        </div>
      )}
      {remote.length > 0 && (
        <div>
          <span><b>Changed by {by.length ? by.join(', ') : 'others'}:</b> {remote.map((r) => itemName(r.key)).join(', ')}</span>
          <button className="btn sm" onClick={reloadToSee}>Reload to see it</button>
        </div>
      )}
    </div>
  );
}
