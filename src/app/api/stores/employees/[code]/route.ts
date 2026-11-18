import * as St from '@/lib/server/storesEmployees';
import { route } from '@/lib/server/http';
export const PATCH = route(St.editEmployee);
export const DELETE = route(St.deleteEmployee);
