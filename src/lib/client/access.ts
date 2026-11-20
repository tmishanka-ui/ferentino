import { SECTIONS, type Section } from '@/lib/registry';
import type { AuthUser } from './store';

/** Which departments/apps a signed-in person may see and use. Administrator and Manager see and edit
 *  everything; Executive can see and open every department, but editing is limited to the departments
 *  assigned to them; Normal User is limited to seeing and using the individual apps assigned to them,
 *  across any department. */

export function visibleSections(user: AuthUser | null): Section[] {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'executive') return SECTIONS;
  return SECTIONS.filter((s) => s.tabs.some((t) => user.apps.includes(t[0])));
}

export function visibleTabs(user: AuthUser | null, section: Section): [string, string][] {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'executive') return section.tabs;
  return section.tabs.filter((t) => user.apps.includes(t[0]));
}

export function canOpenApp(user: AuthUser | null, section: Section, appKey: string): boolean {
  return visibleTabs(user, section).some((t) => t[0] === appKey);
}

/** Whether the person can edit this department (not just view it). Admin and Manager always can;
 *  Executive only on the departments assigned to them; Normal User doesn't edit whole departments. */
export function canEditSection(user: AuthUser | null, sectionId: string): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  if (user.role === 'executive') return user.sections.includes(sectionId);
  return false;
}
