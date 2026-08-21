import type {Role} from '@/types';
const order:Record<Role,number>={MEMBER:1,ADMIN:2,SUPER_ADMIN:3};
export function hasRole(userRole:Role,minimum:Role){return order[userRole]>=order[minimum]}
export function canManageMembers(role:Role){return hasRole(role,'ADMIN')}
export function canViewAuditLogs(role:Role){return role==='SUPER_ADMIN'}
export function canAccessRoute(role:Role,path:string){if(path.startsWith('/admin/audit'))return canViewAuditLogs(role);if(path.startsWith('/admin'))return hasRole(role,'ADMIN');if(path.startsWith('/member'))return hasRole(role,'MEMBER');return true}
