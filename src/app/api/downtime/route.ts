import * as DT from '@/lib/server/downtime';
import { route } from '@/lib/server/http';
export const GET = route(DT.get);
export const PUT = route(DT.put);
export const DELETE = route(DT.del);
