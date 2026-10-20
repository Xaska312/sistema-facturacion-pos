import { Component, inject, input, model } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CashReport } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { BrandingService } from '../../core/theme/branding.service';
import { loadReceiptWidth, printReceipt } from '../../shared/receipt/receipt-prefs';
import { CashReportComponent } from './cash-report.component';
import { CashTicketComponent } from './cash-ticket.component';
import { cashSummaryWhatsApp } from './cash-ticket-text';

/**
 * Informe de caja en un diálogo, con "Imprimir ticket" y "Enviar por WhatsApp". Se abre solo al cerrar la caja (Mi
 * caja) y desde Historial de caja para reimprimir un cierre.
 */
@Component({
  selector: 'app-cash-report-dialog',
  imports: [ButtonModule, DialogModule, CashReportComponent, CashTicketComponent],
  template: `
    <p-dialog [header]="header()" [(visible)]="visible" [modal]="true" [style]="{ width: '32rem' }"
              [breakpoints]="{ '640px': '100vw' }">
      @if (report(); as r) {
        <app-cash-report [report]="r" />
        <app-cash-ticket class="receipt-print-root" [report]="r" [businessName]="businessName()" [width]="width"
                         [logo]="brandLogo()" />
      }
      <ng-template #footer>
        @if (report(); as r) {
          <div class="flex flex-wrap justify-end gap-2">
            <a pButton label="Enviar por WhatsApp" icon="pi pi-whatsapp" severity="secondary" [outlined]="true"
               target="_blank" rel="noopener noreferrer" [href]="whatsApp(r)"
               aria-label="Enviar el resumen de la caja por WhatsApp (abre WhatsApp)"></a>
            <p-button label="Imprimir ticket" icon="pi pi-print" (onClick)="print()" />
          </div>
        }
      </ng-template>
    </p-dialog>
  `,
})
export class CashReportDialogComponent {
  private readonly auth = inject(AuthService);
  protected readonly brandLogo = inject(BrandingService).logo;

  readonly visible = model(false);
  readonly report = input<CashReport | null>(null);
  /** Ancho del papel guardado en este equipo (el mismo del tiquete de venta). */
  protected readonly width = loadReceiptWidth();

  protected header(): string {
    return this.report()?.session.status === 'CLOSED' ? 'Cierre de caja' : 'Informe de caja';
  }

  protected businessName(): string {
    return this.auth.currentTenant()?.tradeName ?? '';
  }

  protected whatsApp(report: CashReport): string {
    return cashSummaryWhatsApp(report, this.businessName());
  }

  print(): void {
    printReceipt();
  }
}
