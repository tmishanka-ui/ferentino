import * as P from '@/lib/server/press';
import { route } from '@/lib/server/http';
export const GET = route(P.getKv);
export const PUT = route(P.putKv);
