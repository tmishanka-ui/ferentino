import * as C from '@/lib/server/capa';
import { route } from '@/lib/server/http';
export const GET = route(C.listShifts);
export const POST = route(C.putShifts);
