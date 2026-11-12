import { Component, inject, input } from '@angular/core';
import { MenuItem, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { Sale } from '../../core/api/api.models';
import { receiptRows } from '../../shared/receipt/receipt-rows';
import { shareTicketPng, ticketPng } from '../../shared/ticket-image';
import { saleWhatsAppLink } from './sale-text';

/**
 * Botón "Enviar" del recibo (decisión 326): un menú con WhatsApp (el recibo en texto) e Imagen (el tiquete como foto,
 * igual al impreso). Junta las dos opciones para que los botones del recibo quepan en una fila, también en el celular.
 */
@Component({
  selector: 'app-receipt-send',
  imports: [ButtonModule, MenuModule],
  template: `
    <p-button label="Enviar" icon="pi pi-send" severity="secondary" [outlined]="true" styleClass="min-h-11"
              ariaLabel="Enviar el recibo por WhatsApp o como imagen" aria-haspopup="menu"
              (onClick)="menu.toggle($event)" />
    <p-menu #menu [model]="items()" [popup]="true" appendTo="body" />
  `,
})
export class ReceiptSendComponent {
  readonly sale = input.required<Sale>();
  /** Logo del negocio (data URL) para la imagen. */
  readonly logo = input<string | null>(null);

  private readonly messages = inject(MessageService);

  protected items(): MenuItem[] {
    return [
      { label: 'WhatsApp (texto)', icon: 'pi pi-whatsapp', url: saleWhatsAppLink(this.sale()), target: '_blank' },
      { label: 'Imagen del tiquete', icon: 'pi pi-image', command: () => void this.shareImage() },
    ];
  }

  protected async shareImage(): Promise<void> {
    const sale = this.sale();
    const blob = await ticketPng(receiptRows(sale), this.logo());
    if (!blob) {
      this.messages.add({ severity: 'warn', summary: 'Imagen', detail: 'Este navegador no pudo crear la imagen.', life: 5000 });
      return;
    }
    const result = await shareTicketPng(blob, `tiquete-${sale.documentNumber}.png`);
    if (result === 'downloaded') {
      this.messages.add({ severity: 'success', summary: 'Imagen descargada',
        detail: 'Adjúntala en WhatsApp o donde la necesites.', life: 5000 });
    }
  }
}
