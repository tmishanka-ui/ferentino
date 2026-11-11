import * as S from '@/lib/server/shiftgroups';
import { route } from '@/lib/server/http';
export const GET = route(S.getEditors);
export const PUT = route(S.putEditors);
