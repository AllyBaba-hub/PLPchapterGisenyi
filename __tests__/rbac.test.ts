import {can, canAccessRoute, isAdminRole, PERMISSIONS} from '@/lib/rbac';
import type {Role} from '@/types';
// Matrix copied from specification section 3.3.3 (independent of the implementation)
const MATRIX: Record<string, [boolean, boolean, boolean, boolean, boolean, boolean]> = { // view, approve, events, news, audit, roles
  MEMBER: [false, false, false, false, false, false], SECRETARY: [true, false, false, false, false, false], EVENTS_COORDINATOR: [true, false, true, false, false, false],
  COMMUNICATIONS_OFFICER: [true, false, false, true, false, false], MEMBERSHIP_OFFICER: [true, true, false, false, false, false], CHAPTER_LEADER: [true, true, true, true, false, false], SUPER_ADMIN: [true, true, true, true, true, true], TREASURER: [false, false, false, false, false, false],
};
test.each(Object.entries(MATRIX))('permission matrix for %s', (role, e) => {
  const r = role as Role; expect([can(r, 'members.view'), can(r, 'applications.decide'), can(r, 'events.manage'), can(r, 'news.manage'), can(r, 'audit.view'), can(r, 'roles.manage')]).toEqual(e);
});
test('route protection', () => {
  expect(canAccessRoute('MEMBER', '/admin')).toBe(false); expect(canAccessRoute('MEMBER', '/dashboard')).toBe(true);
  expect(canAccessRoute('SECRETARY', '/admin/audit-logs')).toBe(false); expect(canAccessRoute('SUPER_ADMIN', '/admin/audit-logs')).toBe(true);
  expect(canAccessRoute('CHAPTER_LEADER', '/admin/roles')).toBe(false); expect(canAccessRoute('SECRETARY', '/dashboard')).toBe(false);
  expect(canAccessRoute('MEMBER', '/events')).toBe(true); expect(isAdminRole('TREASURER')).toBe(true); expect(Object.keys(PERMISSIONS).length).toBeGreaterThan(5);
});
