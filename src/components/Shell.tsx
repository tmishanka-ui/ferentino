'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { authInit } from '@/lib/client/auth';
import { start as retrySync } from '@/lib/client/sync';
import { useStore } from '@/lib/client/store';
import { ForcedPassword, LoginScreen } from './LoginScreen';
import { Chrome } from './Chrome';
import { Dialogs } from './Dialogs';

export function Shell({ children }: { children: React.ReactNode }) {
  const auth = useStore((s) => s.auth);
  const lock = useStore((s) => s.sync.lock);
  const syncReady = useStore((s) => s.sync.ready);
  const toastText = useStore((s) => s.toast.text);
  const pathname = usePathname();
  const [chrome, setChrome] = useState(false);

  useEffect(() => { authInit(); }, []);

  const signedIn = auth.status === 'in' && !!auth.user && !auth.user.mustChange;
  // once the system has been opened it stays mounted behind the sign-in screen, so the working apps keep their place
  useEffect(() => { if (signedIn && syncReady) setChrome(true); }, [signedIn, syncReady]);

  return (
    <>
      {chrome && <Chrome pathname={pathname}>{children}</Chrome>}

      {!chrome && auth.status === 'loading' && (
        <div className="splash"><div><div className="spin" /><p>Starting the Ferentino management system…</p></div></div>
      )}
      {!chrome && signedIn && !lock && !syncReady && (
        <div className="splash"><div><div className="spin" /><p>Loading the data from the server…</p></div></div>
      )}
      {signedIn && lock?.kind === 'loading' && !chrome && (
        <div className="splash"><div><div className="spin" /><p>{lock.text}</p></div></div>
      )}
      {signedIn && lock?.kind === 'error' && (
        <div className="splash">
          <div>
            <p className="err"><b>The data could not be loaded from the server.</b><br />{lock.text}</p>
            <button className="btn red" onClick={retrySync}>Try again</button>
          </div>
        </div>
      )}

      {auth.status === 'out' && <LoginScreen />}
      {auth.status === 'in' && auth.user?.mustChange && <ForcedPassword />}

      <Dialogs />
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </>
  );
}
