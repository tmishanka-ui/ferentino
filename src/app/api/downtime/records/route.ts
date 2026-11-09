import * as DT from '@/lib/server/downtime';
import { route } from '@/lib/server/http';
export const GET = route(DT.listRecords);
export const POST = route(DT.addRecords);
export const DELETE = route(DT.clearRecords);
