import * as St from '@/lib/server/stores';
import { route } from '@/lib/server/http';
export const DELETE = route(St.deleteTxn);
