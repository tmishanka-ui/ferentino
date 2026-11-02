import * as A from '@/lib/server/auth';
import { route } from '@/lib/server/http';
export const GET = route(A.auditLog);
