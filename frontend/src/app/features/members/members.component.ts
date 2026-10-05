import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AccessApi, invitationLink } from '../../core/api/access.api';
import { Branch, Invitation, Member, PageResponse, Role } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { copyToClipboard } from '../../shared/clipboard';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { assignableRoles, toggleIn } from './assignable';

type Tab = 'members' | 'invitations';

@Component({
  selector: 'app-members',
  imports: [FormsModule, DatePipe, ButtonModule, DialogModule, InputTextModule, TagModule, DataTableComponent,
    HasPermissionDirective],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Usuarios</h1>
      <p-button *hasPermission="'members:manage'" label="Invitar usuario" (onClick)="openInvite()" />
    </div>

    <div class="flex gap-2 mb-3">
      <button type="button" class="px-3 py-1 rounded" [class.bg-brand]="tab() === 'members'"
              [class.text-brand-contrast]="tab() === 'members'" [attr.aria-pressed]="tab() === 'members'" (click)="tab.set('members')">Miembros</button>
      <button type="button" class="px-3 py-1 rounded" [class.bg-brand]="tab() === 'invitations'"
              [class.text-brand-contrast]="tab() === 'invitations'" [attr.aria-pressed]="tab() === 'invitations'" (click)="showInvitations()">Invitaciones pendientes</button>
    </div>

    @if (tab() === 'members') {
      <input pInputText class="mb-3 w-full md:w-80" placeholder="Buscar por nombre" [(ngModel)]="search"
             (keyup.enter)="loadMembers(0)" />
      <app-data-table [columns]="memberColumns" [page]="members()" [loading]="loading()" [trackBy]="memberId"
                      (pageChange)="loadMembers($event)">
        <ng-template #actions let-row>
          <span class="inline-flex gap-2 items-center">
            @if (row.owner) {
              <p-tag value="Propietario" severity="info" />
            }
            <p-tag [value]="row.active ? 'Activo' : 'Inactivo'" [severity]="row.active ? 'success' : 'secondary'" />
            @if (canManage(row)) {
              <p-button label="Editar" size="small" [text]="true" (onClick)="openEdit(row)" />
              <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                        [severity]="row.active ? 'danger' : 'success'" (onClick)="toggleMember(row)" />
            }
          </span>
        </ng-template>
      </app-data-table>
    } @else {
      <app-data-table [columns]="invitationColumns" [page]="invitations()" [loading]="loading()"
                      [trackBy]="invitationId" emptyText="No hay invitaciones pendientes"
                      (pageChange)="loadInvitations($event)">
        <ng-template #actions let-row>
          <span class="inline-flex gap-2 items-center">
            @if (row.expired) {
              <p-tag value="Vencida" severity="warn" />
            }
            <span class="text-xs text-muted">vence {{ row.expiresAt | date: 'short' }}</span>
            <p-button *hasPermission="'members:manage'" label="Revocar" size="small" [text]="true" severity="danger"
                      (onClick)="revoke(row)" />
          </span>
        </ng-template>
      </app-data-table>
    }

    <!-- Invitar -->
    <p-dialog [(visible)]="inviteOpen" [modal]="true" header="Invitar usuario" [style]="{ width: '34rem' }">
      @if (createdLink(); as link) {
        <div class="flex flex-col gap-3">
          <p>Comparte este enlace con <strong>{{ invitedEmail() }}</strong> (WhatsApp, correo…). Vence en 7 días y
            solo se muestra ahora.</p>
          <input pInputText readonly class="w-full font-mono text-xs" [value]="link" />
          <div class="flex justify-end gap-2">
            <p-button label="Copiar enlace" (onClick)="copy(link)" />
            <p-button label="Cerrar" [text]="true" severity="secondary" (onClick)="inviteOpen = false" />
          </div>
        </div>
      } @else {
        <div class="flex flex-col gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Correo</span>
            <input pInputText type="email" [(ngModel)]="inviteEmail" />
          </label>
          <fieldset>
            <legend class="text-sm font-medium mb-1">Roles</legend>
            @for (role of assignable(); track role.id) {
              <label class="flex items-center gap-2 py-1">
                <input type="checkbox" [checked]="selectedRoles().has(role.id)"
                       (change)="selectedRoles.set(toggle(selectedRoles(), role.id))" />
                {{ role.name }}
              </label>
            }
          </fieldset>
          <fieldset>
            <legend class="text-sm font-medium mb-1">Sucursales</legend>
            @for (branch of activeBranches(); track branch.id) {
              <label class="flex items-center gap-2 py-1">
                <input type="checkbox" [checked]="selectedBranches().has(branch.id)"
                       (change)="selectedBranches.set(toggle(selectedBranches(), branch.id))" />
                {{ branch.name }}
              </label>
            }
          </fieldset>
          <div class="flex justify-end gap-2">
            <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="inviteOpen = false" />
            <p-button label="Generar enlace" [loading]="saving()" [disabled]="!canInvite()" (onClick)="invite()" />
          </div>
        </div>
      }
    </p-dialog>

    <!-- Editar miembro -->
    <p-dialog [(visible)]="editOpen" [modal]="true" [header]="'Editar ' + (editing()?.displayName ?? '')"
              [style]="{ width: '34rem' }">
      <div class="flex flex-col gap-3">
        <fieldset>
          <legend class="text-sm font-medium mb-1">Roles</legend>
          @for (role of assignable(); track role.id) {
            <label class="flex items-center gap-2 py-1">
              <input type="checkbox" [checked]="selectedRoles().has(role.id)"
                     (change)="selectedRoles.set(toggle(selectedRoles(), role.id))" />
              {{ role.name }}
            </label>
          }
        </fieldset>
        <fieldset>
          <legend class="text-sm font-medium mb-1">Sucursales</legend>
          @for (branch of activeBranches(); track branch.id) {
            <label class="flex items-center gap-2 py-1">
              <input type="checkbox" [checked]="selectedBranches().has(branch.id)"
                     (change)="selectedBranches.set(toggle(selectedBranches(), branch.id))" />
              {{ branch.name }}
            </label>
          }
        </fieldset>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Sucursal predeterminada</span>
          <select class="border rounded px-2 py-2" [(ngModel)]="defaultBranch">
            @for (branch of activeBranches(); track branch.id) {
              @if (selectedBranches().has(branch.id)) {
                <option [value]="branch.id">{{ branch.name }}</option>
              }
            }
          </select>
        </label>
        <div class="flex justify-end gap-2">
          <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="editOpen = false" />
          <p-button label="Guardar" [loading]="saving()"
                    [disabled]="selectedRoles().size === 0 || selectedBranches().size === 0" (onClick)="saveMember()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class MembersComponent implements OnInit {
  private readonly access = inject(AccessApi);
  private readonly organization = inject(OrganizationApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly tab = signal<Tab>('members');
  protected readonly members = signal<PageResponse<Member> | null>(null);
  protected readonly invitations = signal<PageResponse<Invitation> | null>(null);
  protected readonly roles = signal<Role[]>([]);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly selectedRoles = signal<Set<string>>(new Set());
  protected readonly selectedBranches = signal<Set<string>>(new Set());
  protected readonly editing = signal<Member | null>(null);
  protected readonly createdLink = signal<string | null>(null);
  protected readonly invitedEmail = signal('');
  protected readonly assignable = computed(() => assignableRoles(this.roles(), this.auth.permissions()));
  protected readonly activeBranches = computed(() => this.branches().filter((b) => b.active));
  protected readonly toggle = toggleIn;

  protected search = '';
  protected inviteEmail = '';
  protected defaultBranch = '';
  protected inviteOpen = false;
  protected editOpen = false;
  private memberPage = 0;

  protected readonly memberId = (row: Member): string => row.id;
  protected readonly invitationId = (row: Invitation): string => row.id;
  protected readonly memberColumns: ColumnDef<Member>[] = [
    { header: 'Nombre', cell: (m) => m.displayName },
    { header: 'Correo', cell: (m) => m.email ?? '—' },
    { header: 'Roles', cell: (m) => m.roles.map((r) => r.name).join(', ') || '—' },
    { header: 'Sucursales', cell: (m) => m.branches.map((b) => b.name).join(', ') || '—' },
  ];
  protected readonly invitationColumns: ColumnDef<Invitation>[] = [
    { header: 'Correo', cell: (i) => i.email },
    { header: 'Roles', cell: (i) => i.roles.map((r) => r.name).join(', ') },
    { header: 'Sucursales', cell: (i) => i.branches.map((b) => b.name).join(', ') },
    { header: 'Invitado por', cell: (i) => i.invitedByName ?? '—' },
  ];

  ngOnInit(): void {
    this.loadMembers(0);
    this.access.roles().subscribe((list) => this.roles.set(list));
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
  }

  protected canManage(member: Member): boolean {
    return this.auth.hasPermission('members:manage') && !member.owner && member.id !== this.auth.user()?.id;
  }

  protected canInvite(): boolean {
    return /^\S+@\S+\.\S+$/.test(this.inviteEmail) && this.selectedRoles().size > 0 && this.selectedBranches().size > 0;
  }

  loadMembers(page: number): void {
    this.memberPage = page;
    this.loading.set(true);
    this.access.members({ page, size: 20, sort: 'displayName,asc' }, this.search.trim() || null).subscribe({
      next: (result) => {
        this.members.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  showInvitations(): void {
    this.tab.set('invitations');
    this.loadInvitations(0);
  }

  loadInvitations(page: number): void {
    this.loading.set(true);
    this.access.invitations({ page, size: 20 }, true).subscribe({
      next: (result) => {
        this.invitations.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openInvite(): void {
    this.inviteEmail = '';
    this.createdLink.set(null);
    this.selectedRoles.set(new Set());
    const principal = this.activeBranches().find((b) => b.code === 'PRINCIPAL') ?? this.activeBranches()[0];
    this.selectedBranches.set(new Set(principal ? [principal.id] : []));
    this.inviteOpen = true;
  }

  invite(): void {
    this.saving.set(true);
    this.access.invite(this.inviteEmail.trim(), [...this.selectedRoles()], [...this.selectedBranches()]).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.invitedEmail.set(created.invitation.email);
        this.createdLink.set(invitationLink(window.location.origin, created.token));
        if (this.tab() === 'invitations') {
          this.loadInvitations(0);
        }
      },
      error: () => this.saving.set(false),
    });
  }

  async copy(link: string): Promise<void> {
    const ok = await copyToClipboard(link);
    this.messages.add(ok
      ? { severity: 'success', summary: 'Enlace copiado' }
      : { severity: 'warn', summary: 'No se pudo copiar', detail: 'Selecciona el enlace y cópialo manualmente.' });
  }

  revoke(invitation: Invitation): void {
    this.confirm.confirm({
      header: 'Revocar invitación',
      message: `¿Revocar la invitación de ${invitation.email}? El enlace dejará de funcionar.`,
      acceptLabel: 'Revocar',
      rejectLabel: 'Cancelar',
      accept: () => this.access.revokeInvitation(invitation.id).subscribe(() => this.loadInvitations(0)),
    });
  }

  openEdit(member: Member): void {
    this.editing.set(member);
    this.selectedRoles.set(new Set(member.roles.map((r) => r.id)));
    this.selectedBranches.set(new Set(member.branches.map((b) => b.id)));
    this.defaultBranch = member.defaultBranchId ?? member.branches[0]?.id ?? '';
    this.editOpen = true;
  }

  saveMember(): void {
    const member = this.editing();
    if (!member) {
      return;
    }
    const branchIds = [...this.selectedBranches()];
    const defaultBranch = branchIds.includes(this.defaultBranch) ? this.defaultBranch : branchIds[0];
    this.saving.set(true);
    this.access.updateMember(member.id, [...this.selectedRoles()], branchIds, defaultBranch ?? null).subscribe({
      next: () => {
        this.saving.set(false);
        this.editOpen = false;
        this.messages.add({ severity: 'success', summary: 'Usuario actualizado',
          detail: 'Los cambios aplican cuando el usuario renueve su sesión (máx. 15 min).' });
        this.loadMembers(this.memberPage);
      },
      error: () => this.saving.set(false),
    });
  }

  toggleMember(member: Member): void {
    const activate = !member.active;
    this.confirm.confirm({
      header: activate ? 'Activar usuario' : 'Desactivar usuario',
      message: activate
        ? `¿Activar a ${member.displayName}?`
        : `¿Desactivar a ${member.displayName}? No podrá volver a entrar a este negocio.`,
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => this.access.setMemberActive(member.id, activate).subscribe(() => this.loadMembers(this.memberPage)),
    });
  }
}
