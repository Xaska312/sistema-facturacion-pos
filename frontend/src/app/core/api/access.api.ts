import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Invitation,
  InvitationAccepted,
  InvitationCreated,
  InvitationPreview,
  Member,
  PageResponse,
  Permission,
  Role,
  RoleInput,
} from './api.models';
import { PageQuery, pageParams } from './organization.api';

/** Roles, permisos, miembros e invitaciones. */
@Injectable({ providedIn: 'root' })
export class AccessApi {
  private readonly http = inject(HttpClient);

  roles(): Observable<Role[]> {
    return this.http.get<Role[]>('/api/v1/roles');
  }

  permissions(): Observable<Permission[]> {
    return this.http.get<Permission[]>('/api/v1/permissions');
  }

  createRole(code: string, input: RoleInput): Observable<Role> {
    return this.http.post<Role>('/api/v1/roles', { code, ...input });
  }

  updateRole(id: string, input: RoleInput): Observable<Role> {
    return this.http.put<Role>(`/api/v1/roles/${id}`, input);
  }

  deleteRole(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/roles/${id}`);
  }

  members(query: PageQuery, search: string | null): Observable<PageResponse<Member>> {
    return this.http.get<PageResponse<Member>>('/api/v1/members', { params: pageParams(query, { search }) });
  }

  updateMember(id: string, roleIds: string[], branchIds: string[], defaultBranchId: string | null): Observable<Member> {
    return this.http.put<Member>(`/api/v1/members/${id}`, { roleIds, branchIds, defaultBranchId });
  }

  setMemberActive(id: string, active: boolean): Observable<Member> {
    return this.http.post<Member>(`/api/v1/members/${id}/${active ? 'activate' : 'deactivate'}`, null);
  }

  invitations(query: PageQuery, pendingOnly: boolean): Observable<PageResponse<Invitation>> {
    return this.http.get<PageResponse<Invitation>>('/api/v1/members/invitations', {
      params: pageParams(query, { pending: String(pendingOnly) }),
    });
  }

  invite(email: string, roleIds: string[], branchIds: string[]): Observable<InvitationCreated> {
    return this.http.post<InvitationCreated>('/api/v1/members/invitations', { email, roleIds, branchIds });
  }

  revokeInvitation(id: string): Observable<Invitation> {
    return this.http.post<Invitation>(`/api/v1/members/invitations/${id}/revoke`, null);
  }

  previewInvitation(token: string): Observable<InvitationPreview> {
    return this.http.post<InvitationPreview>('/api/v1/invitations/preview', { token });
  }

  acceptInvitation(token: string): Observable<InvitationAccepted> {
    return this.http.post<InvitationAccepted>('/api/v1/invitations/accept', { token });
  }
}

/** Enlace que el administrador comparte con la persona invitada. */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/invitacion/${encodeURIComponent(token)}`;
}

/** Agrupa permisos por módulo, conservando el orden recibido. */
export function groupByModule(permissions: Permission[]): { module: string; permissions: Permission[] }[] {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const list = groups.get(permission.module) ?? [];
    list.push(permission);
    groups.set(permission.module, list);
  }
  return [...groups.entries()].map(([module, list]) => ({ module, permissions: list }));
}
