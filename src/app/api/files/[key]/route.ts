import * as S from '@/lib/server/sync';
import { route } from '@/lib/server/http';
export const GET = route(S.fileGet);
export const PUT = route(S.filePut);
export const DELETE = route(S.fileDelete);
