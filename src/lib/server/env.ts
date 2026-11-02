function str(k: string, d: string): string {
  const v = process.env[k];
  return v === undefined || v === '' ? d : v;
}
function num(k: string, d: number): number {
  const n = Number(str(k, String(d)));
  return Number.isFinite(n) ? n : d;
}

export const env = {
  get mongoUri() { return str('MONGODB_URI', 'mongodb://127.0.0.1:27017'); },
  get mongoDb() { return str('MONGODB_DB', 'ferentino'); },
  get adminEmail() { return str('ADMIN_EMAIL', '').trim().toLowerCase(); },
  get adminName() { return str('ADMIN_NAME', 'System Administrator'); },
  get adminPassword() { return str('ADMIN_PASSWORD', ''); },
  get sessionHours() { return num('SESSION_HOURS', 10); },
  get cookieSecure() { return str('COOKIE_SECURE', '0') === '1'; },
  get trustProxy() { return str('TRUST_PROXY', '0') === '1'; },
  // a page's records are one document, and a MongoDB document cannot be larger than 16 MB
  get maxDataMb() { return Math.min(num('MAX_DATA_MB', 15), 15.5); },
  get maxFileMb() { return num('MAX_FILE_MB', 200); },
};
