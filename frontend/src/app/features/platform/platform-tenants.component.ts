import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { Observable, tap } from 'rxjs';
import { PageResponse, TenantStatus, TenantSummary } from '../../core/api/api.models';
import { PlatformApi, PlatformTenant } from '../../core/api/platform.api';
import { ConfirmService } from '../../shared/confirm';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { TENANT_STATUS_LABEL, tenantStatusKey } from './platform-labels';
import { LatestRequest } from '../../shared/latest-request';

/** Negocios de toda la plataforma: buscar, suspender (con motivo) y reactivar. */
@Component({
  selector: 'app-platform-tenants',
  imports: [FormsModule, ButtonModule, InputTextModule, FormDialogComponent, PageHeaderComponent, DataTableComponent,
    CellTemplateDirective],
  template: `
    <app-page-header title="Negocios"
                     description="Todos los negocios de la plataforma. Suspender corta el acceso a sus miembros sin borrar datos; solo desde aquí se reactivan." />

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    caption="Negocios de la plataforma" searchPlaceholder="Nombre, identificador o correo del dueño"
                    emptyIcon="pi pi-building" emptyTitle="No hay negocios con estos filtros"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Estado</span>
        <select class="border rounded-md px-2 py-2" [(ngModel)]="status" (ngModelChange)="reloadFirstPage()">
          <option [ngValue]="null">Todos</option>
          @for (option of statusOptions; track option.value) {
            <option [ngValue]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
      <ng-template appCell="business" let-row>
        <div class="flex flex-col">
          <span class="font-medium">{{ row.tradeName }}</span>
          <span class="text-xs text-muted font-mono">{{ row.slug }}</span>
        </div>
      </ng-template>
      <ng-template appCell="owner" let-row>
        <div class="flex flex-col">
          <span>{{ row.ownerName }}</span>
          <span class="text-xs text-muted">{{ row.ownerEmail }}</span>
        </div>
      </ng-template>
      <ng-template appCell="reason" let-row>
        @if (row.status === 'SUSPENDED') {
          <span class="text-sm">{{ row.closedByOwner ? 'Lo eliminó su dueño' : 'Suspendido' }}{{ row.suspensionReason ? ': ' + row.suspensionReason : '' }}</span>
        } @else {
          <span class="text-muted">—</span>
        }
      </ng-template>
      <ng-template #actions let-row>
        @if (row.status === 'ACTIVE') {
          <p-button label="Suspender" icon="pi pi-ban" size="small" severity="danger" [text]="true"
                    (onClick)="openSuspend(row)" [ariaLabel]="'Suspender ' + row.tradeName" />
        } @else if (row.status === 'SUSPENDED') {
          <p-button label="Reactivar" icon="pi pi-replay" size="small" [text]="true"
                    (onClick)="reactivate(row)" [ariaLabel]="'Reactivar ' + row.tradeName" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="suspendOpen" [header]="'Suspender ' + (target()?.tradeName ?? '')" width="30rem"
                     submitLabel="Suspender negocio" submitIcon="pi pi-ban" [destructive]="true"
                     [dirty]="reason.trim().length > 0"
                     [invalidMessage]="reason.trim() ? null : 'Escribe el motivo (lo verán los miembros del negocio).'"
                     [save]="suspendRequest" successMessage="Negocio suspendido" (saved)="load(query)"
                     description="Nadie podrá entrar y se cierran las sesiones abiertas. Los datos no se borran y lo puedes reactivar cuando quieras.">
      <div class="flex flex-col gap-1">
        <label for="suspend-reason" class="text-sm font-medium">Motivo</label>
        <input pInputText id="suspend-reason" maxlength="300" [(ngModel)]="reason" placeholder="Pago pendiente" />
        <small class="text-muted">Lo verán el dueño y los miembros al iniciar sesión.</small>
      </div>
    </app-form-dialog>
  `,
})
export class PlatformTenantsComponent implements OnInit {
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  private readonly platform = inject(PlatformApi);
  private readonly confirm = inject(ConfirmService);
  private readonly messages = inject(MessageService);

  protected readonly page = signal<PageResponse<PlatformTenant> | null>(null);
  protected readonly loading = signal(true);
  protected readonly target = signal<PlatformTenant | null>(null);
  protected status: TenantStatus | null = null;
  protected query: TableQuery = initialQuery();
  protected suspendOpen = false;
  protected reason = '';

  protected readonly statusOptions = (Object.keys(TENANT_STATUS_LABEL) as TenantStatus[])
    .map((value) => ({ value, label: TENANT_STATUS_LABEL[value] }));
  protected readonly trackById = (row: PlatformTenant): string => row.id;
  protected readonly columns: ColumnDef<PlatformTenant>[] = [
    { header: 'Negocio', cell: (t) => t.tradeName, template: 'business' },
    { header: 'Dueño', cell: (t) => t.ownerEmail, template: 'owner' },
    { header: 'Miembros', cell: (t) => t.activeMembers, kind: 'number', hideOnMobile: true },
    { header: 'Creado', cell: (t) => t.createdAt, kind: 'date', hideOnMobile: true },
    { header: 'Estado', cell: (t) => tenantStatusKey(t.status), kind: 'status', statusLabel: (t) => TENANT_STATUS_LABEL[t.status] },
    { header: 'Suspensión', cell: (t) => t.suspensionReason, template: 'reason', hideOnMobile: true },
  ];

  ngOnInit(): void {
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.platform.tenants(query.search, this.status, query.page, query.size).pipe(this.latest.only()).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  reloadFirstPage(): void {
    this.load({ ...this.query, page: 0 });
  }

  openSuspend(row: PlatformTenant): void {
    this.target.set(row);
    this.reason = '';
    this.suspendOpen = true;
  }

  protected readonly suspendRequest = (): Observable<TenantSummary> => {
    const target = this.target();
    if (!target) {
      throw new Error('Sin negocio seleccionado');
    }
    return this.platform.suspend(target.id, this.reason.trim());
  };

  reactivate(row: PlatformTenant): void {
    this.confirm.ask({
      header: `Reactivar ${row.tradeName}`,
      message: row.closedByOwner
        ? 'Su dueño lo había eliminado. Reactívalo solo si él lo pidió: sus miembros podrán volver a entrar.'
        : 'Sus miembros podrán volver a entrar con sus cuentas.',
      acceptLabel: 'Reactivar negocio',
      accept: () => {
        this.platform.reactivate(row.id).pipe(
          tap(() => this.messages.add({ severity: 'success', summary: 'Negocio reactivado' })),
        ).subscribe(() => this.load(this.query));
      },
    });
  }
}
