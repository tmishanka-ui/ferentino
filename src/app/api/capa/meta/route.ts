import * as C from '@/lib/server/capa';
import { route } from '@/lib/server/http';
export const GET = route(C.getMeta);
export const PUT = route(C.putMeta);
