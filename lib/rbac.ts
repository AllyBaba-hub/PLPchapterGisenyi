import type {Role} from '@/types';
const LEAD = ['CHAPTER_LEADER', 'VICE_LEADER', 'SUPER_ADMIN'] as const;
/** Permission matrix from specification section 3.3.3 and parts 6 and 7. */
export const PERMISSIONS = {
  'members.view': ['SECRETARY', 'EVENTS_COORDINATOR', 'COMMUNICATIONS_OFFICER', 'MEMBERSHIP_OFFICER', ...LEAD],
  'members.edit': ['MEMBERSHIP_OFFICER', ...LEAD],
  'applications.view': ['MEMBERSHIP_OFFICER', 'SECRETARY', ...LEAD],
  'applications.decide': ['MEMBERSHIP_OFFICER', ...LEAD],
  'events.manage': ['EVENTS_COORDINATOR', ...LEAD],
  'news.manage': ['COMMUNICATIONS_OFFICER', 'CHAPTER_LEADER', 'SUPER_ADMIN'],
  'news.delete': ['CHAPTER_LEADER', 'SUPER_ADMIN'],
  'gallery.manage': ['COMMUNICATIONS_OFFICER', 'SUPER_ADMIN'],
  'reports.view': ['SECRETARY', 'CHAPTER_LEADER', 'SUPER_ADMIN'],
  'audit.view': ['SUPER_ADMIN'],
  'roles.manage': ['SUPER_ADMIN'],
  'settings.manage': ['SUPER_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;
export const can = (role: Role, permission: Permission): boolean => (PERMISSIONS[permission] as readonly Role[]).includes(role);
export const isAdminRole = (role: Role): boolean => role !== 'MEMBER';
const SUPER_ONLY = ['/admin/audit-logs', '/admin/roles', '/admin/settings'];
/** Whether `role` may open `path`. Admin roles are kept out of the member portal and vice versa. */
export function canAccessRoute(role: Role, path: string): boolean {
  if (SUPER_ONLY.some((p) => path === p || path.startsWith(p + '/'))) return role === 'SUPER_ADMIN';
  if (path === '/admin' || path.startsWith('/admin/')) return isAdminRole(role);
  if (path === '/dashboard' || path.startsWith('/dashboard/') || path === '/profile') return role === 'MEMBER';
  return true;
}
