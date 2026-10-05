import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AccessApi, groupByModule } from '../../core/api/access.api';
import { Permission, Role } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { toggleIn } from '../members/assignable';

const MODULE_LABEL: Record<string, string> = {
  organization: 'Organización',
  access: 'Usuarios y roles',
  catalog: 'Catálogo',
  parties: 'Clientes y proveedores',
  inventory: 'Inventario',
  cash: 'Caja',
  sales: 'Ventas',
  reporting: 'Reportes',
};

@Component({
  selector: 'app-roles',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, TagModule],
  template: `
    <div class="flex items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Roles y permisos</h1>
      <p-button label="Nuevo rol" (onClick)="openCreate()" />
    </div>

    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      @for (role of roles(); track role.id) {
        <article class="card p-4 flex flex-col gap-2">
          <header class="flex items-start justify-between gap-2">
            <div>
              <h2 class="font-medium">{{ role.name }}</h2>
              <p class="text-xs font-mono text-muted">{{ role.code }}</p>
            </div>
            @if (role.systemRole) {
              <p-tag value="Sistema" severity="secondary" />
            }
          </header>
          <p class="text-sm text-muted">{{ role.description ?? '' }}</p>
          <p class="text-xs text-muted">{{ role.permissions.length }} permisos · {{ role.memberCount }} usuario(s)</p>
          <div class="flex gap-2 mt-auto">
            @if (role.editable) {
              <p-button label="Editar" size="small" [text]="true" (onClick)="openEdit(role)" />
            } @else {
              <span class="text-xs text-muted">No editable</span>
            }
            @if (!role.systemRole) {
              <p-button label="Eliminar" size="small" [text]="true" severity="danger"
                        [disabled]="role.memberCount > 0" (onClick)="remove(role)" />
            }
          </div>
        </article>
      }
    </div>

    <p-dialog [(visible)]="dialogOpen" [modal]="true" [header]="editing() ? 'Editar rol' : 'Nuevo rol'"
              [style]="{ width: '40rem' }">
      <div class="flex flex-col gap-3">
        @if (!editing()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Código</span>
            <input pInputText [(ngModel)]="code" placeholder="SUPERVISOR" />
          </label>
        }
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nombre</span>
          <input pInputText [(ngModel)]="name" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Descripción</span>
          <input pInputText [(ngModel)]="description" />
        </label>
        <p class="text-xs text-muted">Solo puedes otorgar permisos que tú tienes.</p>
        <div class="grid gap-3 md:grid-cols-2 max-h-80 overflow-y-auto">
          @for (group of groups(); track group.module) {
            <fieldset>
              <legend class="text-sm font-medium mb-1">{{ moduleLabel(group.module) }}</legend>
              @for (permission of group.permissions; track permission.code) {
                <label class="flex items-start gap-2 py-1 text-sm" [class.opacity-50]="!auth.hasPermission(permission.code)">
                  <input type="checkbox" class="mt-1" [checked]="selected().has(permission.code)"
                         [disabled]="!auth.hasPermission(permission.code)"
                         (change)="selected.set(toggle(selected(), permission.code))" />
                  <span>{{ permission.description }}
                    <span class="block text-xs font-mono text-muted">{{ permission.code }}</span></span>
                </label>
              }
            </fieldset>
          }
        </div>
        <div class="flex justify-end gap-2">
          <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="dialogOpen = false" />
          <p-button label="Guardar" [loading]="saving()" [disabled]="!canSave()" (onClick)="save()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class RolesComponent implements OnInit {
  private readonly api = inject(AccessApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly auth = inject(AuthService);

  protected readonly roles = signal<Role[]>([]);
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly groups = computed(() => groupByModule(this.permissions()));
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly editing = signal<Role | null>(null);
  protected readonly saving = signal(false);
  protected readonly toggle = toggleIn;
  protected dialogOpen = false;
  protected code = '';
  protected name = '';
  protected description = '';

  ngOnInit(): void {
    this.load();
    this.api.permissions().subscribe((list) => this.permissions.set(list));
  }

  protected moduleLabel(module: string): string {
    return MODULE_LABEL[module] ?? module;
  }

  protected canSave(): boolean {
    const codeOk = this.editing() !== null || /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(this.code);
    return codeOk && this.name.trim().length > 0 && this.selected().size > 0;
  }

  load(): void {
    this.api.roles().subscribe((list) => this.roles.set(list));
  }

  openCreate(): void {
    this.editing.set(null);
    this.code = '';
    this.name = '';
    this.description = '';
    this.selected.set(new Set());
    this.dialogOpen = true;
  }

  openEdit(role: Role): void {
    this.editing.set(role);
    this.name = role.name;
    this.description = role.description ?? '';
    this.selected.set(new Set(role.permissions));
    this.dialogOpen = true;
  }

  save(): void {
    const input = { name: this.name.trim(), description: this.description.trim() || null, permissions: [...this.selected()] };
    const current = this.editing();
    this.saving.set(true);
    const request = current ? this.api.updateRole(current.id, input) : this.api.createRole(this.code.trim(), input);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen = false;
        this.messages.add({ severity: 'success', summary: 'Rol guardado',
          detail: 'Los usuarios con este rol verán el cambio al renovar su sesión (máx. 15 min).' });
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  remove(role: Role): void {
    this.confirm.confirm({
      header: 'Eliminar rol',
      message: `¿Eliminar el rol ${role.name}?`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.api.deleteRole(role.id).subscribe(() => this.load()),
    });
  }
}
