import { Component, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DialogModule } from 'primeng/dialog';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { ExpenseCategory, ExpensesApi } from '../../core/api/expenses.api';

/**
 * Categorías de gasto (decisión 320): agregar, renombrar y apagar. No se borran: una apagada deja de ofrecerse al
 * registrar y los gastos que la usaron la conservan.
 */
@Component({
  selector: 'app-expense-categories-dialog',
  imports: [FormsModule, ButtonComponent, DialogModule, AppInputDirective],
  template: `
    <p-dialog header="Categorías de gasto" [(visible)]="visible" [modal]="true" [style]="{ width: '30rem' }"
              [breakpoints]="{ '640px': '96vw' }" (onHide)="changed.emit()">
      <p class="text-sm text-muted mb-3">Son los grupos en que se reparten tus gastos. Renómbralas a tu manera, agrega
        las que te falten y apaga las que no uses.</p>

      <form class="flex gap-2 mb-4" (ngSubmit)="add()">
        <label class="sr-only" for="new-category">Nueva categoría</label>
        <input appInput id="new-category" name="newName" class="flex-1" maxlength="60" [(ngModel)]="newName"
               placeholder="Nueva categoría (ej.: Aseo)" />
        <app-button type="submit" label="Agregar" icon="pi pi-plus" [loading]="saving()"
                  [disabled]="!newName.trim()" />
      </form>

      <ul class="flex flex-col">
        @for (c of categories(); track c.id) {
          <li class="flex items-center gap-2 py-2 border-t border-line first:border-t-0">
            @if (editingId === c.id) {
              <label class="sr-only" [for]="'category-' + c.id">Nombre de la categoría</label>
              <input appInput [id]="'category-' + c.id" class="flex-1" maxlength="60" [(ngModel)]="editingName"
                     [name]="'category-' + c.id" (keydown.enter)="rename(c)" (keydown.escape)="editingId = null" />
              <app-button label="Guardar" size="small" [loading]="saving()" [disabled]="!editingName.trim()"
                        (clicked)="rename(c)" />
              <app-button label="Cancelar" size="small" [text]="true" severity="secondary" (clicked)="editingId = null" />
            } @else {
              <span class="flex-1" [class.text-muted]="!c.active" [class.line-through]="!c.active">{{ c.name }}</span>
              <app-button icon="pi pi-pencil" size="small" [text]="true" severity="secondary"
                        [ariaLabel]="'Renombrar ' + c.name" (clicked)="startRename(c)" />
              <app-button [label]="c.active ? 'Apagar' : 'Prender'" size="small" [text]="true"
                        [severity]="c.active ? 'secondary' : 'primary'" (clicked)="toggle(c)" />
            }
          </li>
        } @empty {
          <li class="py-4 text-sm text-muted">Cargando…</li>
        }
      </ul>
    </p-dialog>
  `,
})
export class ExpenseCategoriesDialogComponent {
  private readonly api = inject(ExpensesApi);

  readonly visible = model(false);
  /** Se cerró el diálogo: quien lo abrió vuelve a pedir sus datos. */
  readonly changed = output<void>();

  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly saving = signal(false);
  protected newName = '';
  protected editingId: string | null = null;
  protected editingName = '';

  open(): void {
    this.newName = '';
    this.editingId = null;
    this.api.categories(true).subscribe((list) => this.categories.set(list));
    this.visible.set(true);
  }

  protected add(): void {
    const name = this.newName.trim();
    if (!name || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.createCategory(name).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.newName = '';
        this.categories.update((list) => [...list, created]);
      },
      error: () => this.saving.set(false),
    });
  }

  protected startRename(category: ExpenseCategory): void {
    this.editingId = category.id;
    this.editingName = category.name;
  }

  protected rename(category: ExpenseCategory): void {
    const name = this.editingName.trim();
    if (!name || this.saving()) {
      return;
    }
    this.save(category, { name });
  }

  protected toggle(category: ExpenseCategory): void {
    this.save(category, { active: !category.active });
  }

  private save(category: ExpenseCategory, change: { name?: string; active?: boolean }): void {
    this.saving.set(true);
    this.api.updateCategory(category.id, change).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editingId = null;
        this.categories.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
      },
      error: () => this.saving.set(false),
    });
  }
}
