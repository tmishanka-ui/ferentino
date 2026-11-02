import { APP_KEYS, APP_TITLES } from '../registry';
import { getState, setState } from './store';

/* Every working app lives in its own iframe (public/apps/<key>.html, same origin as this site, so the apps share the browser's
   saved data with this page and with each other). The frames are created once and kept for the whole visit, so an app keeps
   its place when somebody moves to another page, and the apps can keep passing information to each other. */

export const frames: Record<string, HTMLIFrameElement> = {};
let container: HTMLDivElement | null = null;
const hold = { on: true, queue: [] as string[] };   // nothing loads before the saved data has arrived from the server

/** the frames are created at once (detached), so an app can be asked to load before the page that shows it exists */
function create() {
  if (container) return;
  container = document.createElement('div');
  container.className = 'frame-host';
  for (const key of APP_KEYS) {
    const f = document.createElement('iframe');
    f.className = 'app-frame';
    f.id = 'frame-' + key;
    f.title = APP_TITLES[key];
    // camera: the QR-scanning apps; the rest keeps the page's defaults
    f.setAttribute('allow', 'camera; clipboard-write; fullscreen');
    container.appendChild(f);
    frames[key] = f;
  }
}

export function initFrames(parent: HTMLElement) {
  create();
  if (container!.parentElement !== parent) parent.appendChild(container!);
}

export const win = (key: string): Window | null => frames[key]?.contentWindow ?? null;

export function keyOfSource(src: MessageEventSource | null): string | null {
  if (!src) return null;
  for (const k of Object.keys(frames)) if (frames[k].contentWindow === src) return k;
  return null;
}

export function ensureLoaded(key: string) {
  create();
  if (getState().frames.loaded[key] || !frames[key]) return;
  if (hold.on) { if (!hold.queue.includes(key)) hold.queue.push(key); return; }
  setState({ frames: { loaded: { ...getState().frames.loaded, [key]: true } } });
  const f = frames[key];
  f.addEventListener('load', () => setState({ frames: { ready: { ...getState().frames.ready, [key]: true } } }), { once: true });
  f.src = `/apps/${key}.html`;
}

export function release() {
  hold.on = false;
  hold.queue.splice(0).forEach(ensureLoaded);
}

export function setActive(key: string | null) {
  for (const k of Object.keys(frames)) frames[k].classList.toggle('active', k === key);
  setState({ frames: { active: key } });
  if (key) ensureLoaded(key);
}

/** stops every app (used before a backup is restored, so none can write its old data over the restored data) */
export function stopAll() {
  for (const k of Object.keys(frames)) { try { frames[k].src = 'about:blank'; } catch { /* ignore */ } }
}
