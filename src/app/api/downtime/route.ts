import * as DT from '@/lib/server/downtime';
import { route } from '@/lib/server/http';
export const GET = route(DT.getMeta);
export const PUT = route(DT.putMeta);
export const DELETE = route(DT.delMeta);
