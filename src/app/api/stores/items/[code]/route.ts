import * as St from '@/lib/server/stores';
import { route } from '@/lib/server/http';
export const GET = route(St.getItem);
export const PATCH = route(St.editItem);
