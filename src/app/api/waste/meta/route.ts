import * as W from '@/lib/server/waste';
import { route } from '@/lib/server/http';
export const GET = route(W.getMeta);
export const PUT = route(W.putMeta);
