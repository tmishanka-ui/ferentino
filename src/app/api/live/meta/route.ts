import * as L from '@/lib/server/livemonitor';
import { route } from '@/lib/server/http';
export const GET = route(L.getMeta);
export const PUT = route(L.putMeta);
