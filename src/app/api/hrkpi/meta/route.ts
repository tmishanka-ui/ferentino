import * as H from '@/lib/server/hrkpi';
import { route } from '@/lib/server/http';
export const GET = route(H.getMeta);
export const PUT = route(H.putMeta);
