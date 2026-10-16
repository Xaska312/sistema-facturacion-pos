import { Component, inject, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { Party, PersonType } from '../../core/api/api.models';
import { PartiesApi } from '../../core/api/parties.api';
import { documentTypesFor, isLegalPersonDocument } from '../../shared/document-types';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PartyDraft, draftDv, draftProblem, emptyDraft, toPartyInput } from '../parties/party-form';
import { quickCustomerDraft } from './quick-customer';

/**
 * "Nuevo cliente" sin salir de la venta: lo esencial del formulario de Clientes (documento, nombre, teléfono y
 * correo). Al guardarlo se emite el cliente para usarlo en la venta; el resto de datos se completa en Clientes.
 */
@Component({
  selector: 'app-new-customer-dialog',
  imports: [FormsModule, InputTextModule, FormDialogComponent],
  template: `
    <app-form-dialog [(visible)]="visible" header="Nuevo cliente" width="34rem"
                     description="Queda en Clientes y se usa en esta venta. Los demás datos los completas allá."
                     submitLabel="Guardar y usar en la venta" successMessage="Cliente registrado"
                     [dirty]="dirty()" [invalidMessage]="problem()" [save]="saveRequest" (saved)="done($event)">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="qc-person" class="text-sm font-medium">Tipo de persona</label>
          <select id="qc-person" class="h-11 border rounded-md px-2" [ngModel]="draft.personType"
                  (ngModelChange)="setPersonType($event)">
            <option value="NATURAL">Persona natural</option>
            <option value="LEGAL">Empresa</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="qc-doctype" class="text-sm font-medium">Tipo de documento</label>
          <select id="qc-doctype" class="h-11 border rounded-md px-2" [(ngModel)]="draft.documentType">
            @for (t of documentTypesFor(draft.personType); track t.value) {
              <option [value]="t.value">{{ t.label }}</option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for="qc-number" class="text-sm font-medium">Número de documento</label>
          <div class="flex items-center gap-2">
            <input pInputText id="qc-number" class="flex-1 min-w-0 h-11" inputmode="numeric" autocomplete="off"
                   [(ngModel)]="draft.documentNumber" />
            @if (draft.documentType === 'NIT') {
              <span class="text-sm text-muted" title="Dígito de verificación, se calcula solo">DV {{ dv() ?? '—' }}</span>
            }
          </div>
        </div>
        @if (draft.personType === 'NATURAL') {
          <div class="flex flex-col gap-1">
            <label for="qc-first" class="text-sm font-medium">Nombres</label>
            <input pInputText id="qc-first" class="h-11" autocomplete="off" [(ngModel)]="draft.firstNames" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="qc-last" class="text-sm font-medium">Apellidos</label>
            <input pInputText id="qc-last" class="h-11" autocomplete="off" [(ngModel)]="draft.lastNames" />
          </div>
        } @else {
          <div class="flex flex-col gap-1 sm:col-span-2">
            <label for="qc-business" class="text-sm font-medium">Razón social</label>
            <input pInputText id="qc-business" class="h-11" autocomplete="off" [(ngModel)]="draft.businessName" />
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="qc-phone" class="text-sm font-medium">Teléfono <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="qc-phone" class="h-11" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="draft.phone" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="qc-email" class="text-sm font-medium">Correo <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="qc-email" class="h-11" type="email" inputmode="email" autocomplete="off" [(ngModel)]="draft.email" />
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class NewCustomerDialogComponent {
  private readonly api = inject(PartiesApi);

  readonly visible = model(false);
  /** El cliente recién creado, para usarlo en la venta. */
  readonly created = output<Party>();

  protected readonly documentTypesFor = documentTypesFor;
  protected draft: PartyDraft = emptyDraft();
  private snapshot = JSON.stringify(this.draft);

  /** Antes de abrir: llena el borrador con lo que se buscó (documento o nombre). */
  prepare(searchText: string): void {
    this.draft = quickCustomerDraft(searchText);
    this.snapshot = JSON.stringify(this.draft);
  }

  protected setPersonType(value: PersonType): void {
    this.draft.personType = value;
    if (value === 'LEGAL' && !isLegalPersonDocument(this.draft.documentType)) {
      this.draft.documentType = 'NIT';
    } else if (value === 'NATURAL' && this.draft.documentType === 'FOREIGN_NIT') {
      this.draft.documentType = 'CC';
    }
  }

  protected dv(): number | null {
    return draftDv(this.draft);
  }

  protected problem(): string | null {
    return draftProblem(this.draft);
  }

  protected dirty(): boolean {
    return JSON.stringify(this.draft) !== this.snapshot;
  }

  protected readonly saveRequest = (): Observable<Party> =>
    this.api.save('customers', null, toPartyInput(this.draft, true));

  protected done(result: unknown): void {
    this.created.emit(result as Party);
  }
}
