const PATHS: Record<string, string> = {
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z M9 12l2 2 4-4',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6 2.3-2.2z',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  factory: 'M2 21V9l6 4V9l6 4V4h4v17H2z M6 17h2 M11 17h2',
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  users: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M21 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  coins: 'M12 3a8 4 0 1 0 0 8 8 4 0 0 0 0-8z M4 7v5c0 2.2 3.6 4 8 4s8-1.8 8-4V7 M4 12v5c0 2.2 3.6 4 8 4s8-1.8 8-4v-5',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M16 8l-2 6-6 2 2-6 6-2z',
  flask: 'M9 3h6 M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10 M10 20v-6h4v6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  chevron: 'M6 9l6 6 6-6',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  download: 'M12 3v12 M7 11l5 5 5-5 M4 20h16',
  upload: 'M12 17V5 M7 9l5-5 5 5 M4 20h16',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  key: 'M21 2l-2 2 M15.5 7.5l3 3L22 7l-3-3 M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z M15.5 7.5l-4 4',
  sign: 'M3 21h18 M5 17l2-6 9-9 4 4-9 9-6 2z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  db: 'M12 3a8 3 0 1 0 0 6 8 3 0 0 0 0-6z M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  close: 'M6 6l12 12 M18 6L6 18',
};

export type IconKey = keyof typeof PATHS | string;

export function Icon({ name, size = 18 }: { name: IconKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(PATHS[name] || '').split(' M').map((d, i) => <path key={i} d={(i ? 'M' : '') + d} />)}
    </svg>
  );
}
