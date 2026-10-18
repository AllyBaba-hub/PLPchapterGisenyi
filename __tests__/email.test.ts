import {renderEmailTemplate, statusEvent} from '@/services/email';
test('status maps to email events', () => {
  expect(statusEvent('APPROVED')).toBe('APPLICATION_APPROVED'); expect(statusEvent('REJECTED')).toBe('APPLICATION_REJECTED'); expect(statusEvent('ACTIVE')).toBe('MEMBER_ACTIVATED'); expect(statusEvent('SUSPENDED')).toBe('MEMBER_SUSPENDED'); expect(statusEvent('PENDING')).toBe('APPLICATION_SUBMITTED');
});
test('approval template is branded and professional', () => {
  const m = {fullName: 'Aline', email: 'a@example.com'}, e = renderEmailTemplate('APPLICATION_APPROVED', m);
  expect(e.text).toContain('Welcome to PLP Gisenyi, your application is approved.'); expect(e.html).toContain('PLP Chapter Gisenyi'); expect(e.html).toContain('plp-gisenyi-logo.svg');
});
test('every event renders, escapes HTML and never leaks admin notes', () => {
  const m = {fullName: '<b>Evil</b>', email: 'a@example.com'};
  (['APPLICATION_SUBMITTED', 'APPLICATION_REJECTED', 'MEMBER_ACTIVATED', 'MEMBER_SUSPENDED', 'PASSWORD_RESET_CONFIRMATION', 'EVENT_CANCELLATION_CONFIRMATION'] as const).forEach((ev) => { const r = renderEmailTemplate(ev, m); expect(r.html).not.toContain('<b>Evil</b>'); expect(r.subject).toContain('PLP Chapter Gisenyi'); });
  expect(renderEmailTemplate('MEMBER_ROLE_CHANGED', m, {role: 'SECRETARY'}).text).toContain('SECRETARY');
  expect(renderEmailTemplate('MEMBER_ROLE_CHANGED', m).text).toContain('a new role');
  expect(renderEmailTemplate('EVENT_REGISTRATION_CONFIRMATION', m, {eventName: 'Walk'}).text).toContain('Walk');
  expect(renderEmailTemplate('EVENT_REGISTRATION_CONFIRMATION', m).text).toContain('the event');
  expect(renderEmailTemplate('APPLICATION_REJECTED', m).text).not.toMatch(/admin notes|reason:/i);
});
