import * as St from '@/lib/server/storesEmployees';
import { route } from '@/lib/server/http';
export const GET = route(St.listEmployees);
export const POST = route(St.addEmployee);
