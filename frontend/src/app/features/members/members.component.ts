import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AccessApi, invitationLink } from '../../core/api/access.api';
import { Branch, Invitation, Member, PageResponse, Role } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { copyToClipboard } from '../../shared/clipboard';
import { ConfirmService } from '../../shared/confirm';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { activeStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { assignableRoles, toggleIn } from './assignable';
import { LatestRequest } from '../../shared/latest-request';

type Tab = 'members' | 'invitations';

@Component({
  selector: 'app-members',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, DataTableComponent, HasPermissionDirective,
    PageHeaderComponent],
  template: `
    <app-page-header title="Usuarios" description="Las personas que trabajan en tu negocio, sus roles y sus sucursales.">
      <p-button *hasPermission="'members:manage'" label="Invitar usuario" icon="pi pi-user-plus" (onClick)="openInvite()" />
    </app-page-header>

    <div class="flex flex-wrap gap-1 mb-3 p-1 rounded-lg bg-surface-alt w-fit" role="group" aria-label="Vista">
      <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              [class.bg-surface]="tab() === 'members'" [class.shadow-card]="tab() === 'members'"
              [class.text-muted]="tab() !== 'members'" [attr.aria-pressed]="tab() === 'members'"
              (click)="showMembers()">Miembros</button>
      <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              [class.bg-surface]="tab() === 'invitations'" [class.shadow-card]="tab() === 'invitations'"
              [class.text-muted]="tab() !== 'invitations'" [attr.aria-pressed]="tab() === 'invitations'"
              (click)="showInvitations()">Invitaciones pendientes</button>
    </div>

    @if (tab() === 'members') {
      <app-data-table [columns]="memberColumns" [page]="members()" [loading]="loading()" [trackBy]="memberId"
                      initialSort="displayName,asc" caption="Miembros del negocio" searchPlaceholder="Buscar por nombre"
                      emptyIcon="pi pi-users" emptyTitle="Aún no hay más usuarios"
                      emptyMessage="Invita a tus cajeros y vendedores para que cada uno entre con su usuario."
                      [emptyActionLabel]="mayInvite() ? 'Invitar usuario' : null" emptyActionIcon="pi pi-user-plus"
                      (emptyAction)="openInvite()"
                      (queryChange)="loadMembers($event)">
        <ng-template #actions let-row>
          @if (canManage(row)) {
            <p-button label="Editar" icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEdit(row)" />
            <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                      [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                      [severity]="row.active ? 'danger' : 'success'" (onClick)="toggleMember(row)" />
          }
        </ng-template>
      </app-data-table>
    } @else {
      <app-data-table [columns]="invitationColumns" [page]="invitations()" [loading]="loading()"
                      [trackBy]="invitationId" initialSort="createdAt,desc" caption="Invitaciones pendientes"
                      emptyIcon="pi pi-envelope" emptyTitle="No hay invitaciones pendientes"
                      emptyMessage="Las invitaciones que generes aparecen aquí hasta que las acepten o venzan."
                      [emptyActionLabel]="mayInvite() ? 'Invitar usuario' : null" emptyActionIcon="pi pi-user-plus"
                      (emptyAction)="openInvite()"
                      (queryChange)="loadInvitations($event)">
        <ng-template #actions let-row>
          <p-button *hasPermission="'members:manage'" label="Reenviar" icon="pi pi-send" size="small" [text]="true"
                    (onClick)="resend(row)" />
          <p-button *hasPermission="'members:manage'" label="Revocar" icon="pi pi-times" size="small" [text]="true"
                    severity="danger" (onClick)="revoke(row)" />
        </ng-template>
      </app-data-table>
    }

    <!-- Invitar -->
    <p-dialog [(visible)]="inviteOpen" [modal]="true" header="Invitar usuario" [style]="{ width: '34rem' }">
      @if (createdLink(); as link) {
        <div class="flex flex-col gap-3">
          <p>Le enviamos un correo a <strong>{{ invitedEmail() }}</strong> con la invitación. Si no le llega (revisa
            también la carpeta de spam), compártele este enlace por WhatsApp. Vence en 7 días y solo se muestra
            ahora.</p>
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
            <p-button label="Enviar invitación" [loading]="saving()" [disabled]="!canInvite()" (onClick)="invite()" />
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
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latestMembers = new LatestRequest();
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latestInvitations = new LatestRequest();
  private readonly access = inject(AccessApi);
  private readonly organization = inject(OrganizationApi);
  private readonly auth = inject(AuthService);
  protected readonly mayInvite = computed(() => this.auth.hasPermission('members:manage'));
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmService);

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

  protected inviteEmail = '';
  protected defaultBranch = '';
  protected inviteOpen = false;
  protected editOpen = false;
  private memberQuery: TableQuery = initialQuery(20, 'displayName,asc');
  private invitationQuery: TableQuery = initialQuery(20, 'createdAt,desc');

  protected readonly memberId = (row: Member): string => row.id;
  protected readonly invitationId = (row: Invitation): string => row.id;
  protected readonly memberColumns: ColumnDef<Member>[] = [
    { header: 'Nombre', cell: (m) => m.displayName, sortField: 'displayName' },
    { header: 'Correo', cell: (m) => m.email },
    { header: 'Roles', cell: (m) => m.roles.map((r) => r.name).join(', ') },
    { header: 'Sucursales', cell: (m) => m.branches.map((b) => b.name).join(', '), hideOnMobile: true },
    { header: 'Estado', cell: (m) => (m.owner ? 'owner' : activeStatus(m.active)), kind: 'status' },
  ];
  protected readonly invitationColumns: ColumnDef<Invitation>[] = [
    { header: 'Correo', cell: (i) => i.email, sortField: 'email' },
    { header: 'Roles', cell: (i) => i.roles.map((r) => r.name).join(', ') },
    { header: 'Sucursales', cell: (i) => i.branches.map((b) => b.name).join(', '), hideOnMobile: true },
    { header: 'Invitado por', cell: (i) => i.invitedByName, hideOnMobile: true },
    { header: 'Vence', cell: (i) => i.expiresAt, kind: 'relative', sortField: 'expiresAt' },
    { header: 'Estado', cell: (i) => (i.expired ? 'expired' : 'pending'), kind: 'status' },
  ];

  ngOnInit(): void {
    this.loadMembers(this.memberQuery);
    this.access.roles().subscribe((list) => this.roles.set(list));
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
  }

  protected canManage(member: Member): boolean {
    return this.auth.hasPermission('members:manage') && !member.owner && member.id !== this.auth.user()?.id;
  }

  protected canInvite(): boolean {
    return /^\S+@\S+\.\S+$/.test(this.inviteEmail) && this.selectedRoles().size > 0 && this.selectedBranches().size > 0;
  }

  loadMembers(query: TableQuery): void {
    this.memberQuery = query;
    this.loading.set(true);
    this.access.members(toPageQuery(query), query.search).pipe(this.latestMembers.only()).subscribe({
      next: (result) => {
        this.members.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  showInvitations(): void {
    this.tab.set('invitations');
    // La tabla se crea de nuevo al cambiar de pestaña: se vuelve a su consulta inicial.
    this.loadInvitations(initialQuery(20, 'createdAt,desc'));
  }

  showMembers(): void {
    this.tab.set('members');
    this.loadMembers(initialQuery(20, 'displayName,asc'));
  }

  loadInvitations(query: TableQuery): void {
    this.invitationQuery = query;
    this.loading.set(true);
    this.access.invitations(toPageQuery(query), true).pipe(this.latestInvitations.only()).subscribe({
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
          this.loadInvitations(this.invitationQuery);
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

  /** Reenvía el correo con un enlace nuevo (el anterior deja de funcionar) y muestra el enlace para compartir. */
  resend(invitation: Invitation): void {
    this.confirm.ask({
      header: 'Reenviar invitación',
      message: `¿Reenviar la invitación a ${invitation.email}? Le llegará un correo con un enlace nuevo y el anterior `
        + 'dejará de funcionar.',
      acceptLabel: 'Reenviar invitación',
      accept: () =>
        this.access.resendInvitation(invitation.id).subscribe((created) => {
          this.invitedEmail.set(created.invitation.email);
          this.createdLink.set(invitationLink(window.location.origin, created.token));
          this.inviteOpen = true;
          this.loadInvitations(this.invitationQuery);
        }),
    });
  }

  revoke(invitation: Invitation): void {
    this.confirm.ask({
      header: 'Revocar invitación',
      message: `¿Revocar la invitación de ${invitation.email}? El enlace dejará de funcionar.`,
      acceptLabel: 'Revocar invitación',
      danger: true,
      accept: () => this.access.revokeInvitation(invitation.id).subscribe(() => this.loadInvitations(this.invitationQuery)),
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
        this.loadMembers(this.memberQuery);
      },
      error: () => this.saving.set(false),
    });
  }

  toggleMember(member: Member): void {
    this.confirm.toggleActive({
      active: member.active,
      noun: 'usuario',
      name: member.displayName,
      consequence: 'No podrá volver a entrar a este negocio hasta que lo actives de nuevo.',
      accept: () =>
        this.access.setMemberActive(member.id, !member.active).subscribe(() => this.loadMembers(this.memberQuery)),
    });
  }
}
