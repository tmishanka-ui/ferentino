import * as D from '@/lib/server/doccontrol';
import { route } from '@/lib/server/http';
export const GET = route(D.getMeta);
export const PUT = route(D.putMeta);
