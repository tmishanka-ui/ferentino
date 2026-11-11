import * as T from '@/lib/server/training';
import { route } from '@/lib/server/http';
export const GET = route(T.listSubmissions);
export const POST = route(T.putSubmissions);
export const DELETE = route(T.clearSubmissions);
