import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Branch, PageResponse } from '../../core/api/api.models';
import { HasPermissionDirective } from '../../shared/has-permission.directive';

/** Listado de sucursales del negocio actual (el CRUD completo llega en Fase 2). */
@Component({
  selector: 'app-branches',
  imports: [HasPermissionDirective],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Sucursales</h1>
      <span *hasPermission="'branches:manage'" class="text-sm text-slate-500">Puedes administrar sucursales</span>
    </div>
    <div class="bg-white rounded-xl shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left">
          <tr><th class="p-3">Código</th><th class="p-3">Nombre</th><th class="p-3">Dirección</th><th class="p-3">Estado</th></tr>
        </thead>
        <tbody>
          @for (branch of branches(); track branch.id) {
            <tr class="border-t">
              <td class="p-3 font-mono">{{ branch.code }}</td>
              <td class="p-3">{{ branch.name }}</td>
              <td class="p-3">{{ branch.address ?? '—' }}</td>
              <td class="p-3">{{ branch.active ? 'Activa' : 'Inactiva' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="p-6 text-center text-slate-500">{{ loading() ? 'Cargando…' : 'Sin sucursales' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class BranchesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.http.get<PageResponse<Branch>>('/api/v1/branches', { params: { page: 0, size: 50 } }).subscribe({
      next: (page) => {
        this.branches.set(page.content);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
