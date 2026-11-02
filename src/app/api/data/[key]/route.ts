import * as S from '@/lib/server/sync';
import { route } from '@/lib/server/http';
export const GET = route(S.get);
export const PUT = route(S.put);
export const DELETE = route(S.del);
