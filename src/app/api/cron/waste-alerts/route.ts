import * as W from '@/lib/server/waste';
import { route } from '@/lib/server/http';
// Hit once a day by Vercel Cron (see vercel.json), authenticated by a shared secret — see cronAlerts().
export const GET = route(W.cronAlerts);
