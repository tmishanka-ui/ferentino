import { SECTIONS, type Section } from '@/lib/registry';
import type { AuthUser } from './store';

/** Which departments/apps a signed-in person may see and use. Administrator and Manager see everything;
 *  Executive is limited to the departments assigned to them (every app inside); Normal User is limited
 *  to the individual apps assigned to them, across any department. */

export function visibleSections(user: AuthUser | null): Section[] {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'manager') return SECTIONS;
  if (user.role === 'executive') return SECTIONS.filter((s) => user.sections.includes(s.id));
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
