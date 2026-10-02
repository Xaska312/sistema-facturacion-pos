import { Role } from '../../core/api/api.models';
import { assignableRoles, toggleIn } from './assignable';

function role(code: string, permissions: string[], editable = true): Role {
  return { id: code, code, name: code, description: null, systemRole: true, editable, permissions, memberCount: 0 };
}

describe('assignableRoles', () => {
  const roles = [
    role('OWNER', ['sales:void'], false),
    role('ADMIN', ['sales:void', 'members:manage']),
    role('SELLER', ['sales:create']),
  ];

  it('nunca ofrece OWNER y solo roles con permisos que tengo', () => {
    const mine = new Set(['sales:create', 'members:manage']);
    expect(assignableRoles(roles, mine).map((r) => r.code)).toEqual(['SELLER']);
  });

  it('con todos los permisos ofrece todo menos OWNER', () => {
    const mine = new Set(['sales:void', 'members:manage', 'sales:create']);
    expect(assignableRoles(roles, mine).map((r) => r.code)).toEqual(['ADMIN', 'SELLER']);
  });
});

describe('toggleIn', () => {
  it('agrega y quita sin mutar el original', () => {
    const original = new Set(['a']);
    expect([...toggleIn(original, 'b')]).toEqual(['a', 'b']);
    expect([...toggleIn(original, 'a')]).toEqual([]);
    expect([...original]).toEqual(['a']);
  });
});
