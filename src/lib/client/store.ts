import { useSyncExternalStore } from 'react';

export interface AuthUser {
  id: number; name: string; email: string; designation: string; department: string; role: 'admin' | 'executive' | 'manager'; mustChange: boolean;
}

export interface SignRequest { type: string; id?: string | number; purpose: string; ref: string; summary?: string; content?: string }
export interface SignResult { ok: boolean; reason?: string; sig?: Record<string, unknown> }
export interface Diff { key: string; value: string; version: number }

export type Dialog =
  | { type: 'sign'; req: SignRequest; done: (r: SignResult) => void }
  | { type: 'ask'; diffs: Diff[]; done: (choice: 'server' | 'mine') => void }
  | null;

export interface State {
  auth: { status: 'loading' | 'out' | 'in'; user: AuthUser | null; adminEmail: string; error: string };
  sync: {
    ready: boolean;
    lock: { kind: 'loading' | 'error'; text: string } | null;
    chip: { tone: 'hidden' | 'ok' | 'busy' | 'bad'; text: string };
    conflicts: string[];
    remote: { key: string; by: string }[];
  };
  frames: { active: string | null; loaded: Record<string, boolean>; ready: Record<string, boolean> };
  dialog: Dialog;
  toast: { text: string };
}

let state: State = {
  auth: { status: 'loading', user: null, adminEmail: '', error: '' },
  sync: { ready: false, lock: null, chip: { tone: 'hidden', text: '' }, conflicts: [], remote: [] },
  frames: { active: null, loaded: {}, ready: {} },
  dialog: null,
  toast: { text: '' },
};
const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: { [K in keyof State]?: Partial<State[K]> | State[K] }) {
  const next = { ...state } as Record<string, unknown>;
  for (const k of Object.keys(patch) as (keyof State)[]) {
    const v = patch[k];
    next[k] = k === 'dialog' ? v : { ...(state[k] as object), ...(v as object) };
  }
  state = next as unknown as State;
  listeners.forEach((l) => l());
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => select(state),
    () => select(state),
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  setState({ toast: { text } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: { text: '' } }), 4500);
}
