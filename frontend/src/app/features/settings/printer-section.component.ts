import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ButtonLinkComponent } from '../../shared/ui/button-link.component';
import { AuthService } from '../../core/auth/auth.service';
import { CashDrawerService } from '../../core/printing/cash-drawer.service';
import { testPageBytes } from '../../core/printing/escpos';
import { printableLogo } from '../../core/printing/printable-logo';
import { BrandingService } from '../../core/theme/branding.service';
import { AGENT_DOWNLOAD, PrintAgentService } from '../../core/printing/print-agent.service';
import { ReceiptWidth, loadReceiptWidth, saveReceiptWidth } from '../../shared/receipt/receipt-prefs';

/**
 * Impresora de este equipo (decisión 286): con XASKA Impresora instalado, el tiquete sale directo en la térmica (sin
 * la ventana de impresión), el cajón se abre al cobrar en efectivo y hay un botón "Abrir cajón". Es de cada computador:
 * se guarda en este navegador.
 */
@Component({
  selector: 'app-printer-section',
  imports: [FormsModule, ButtonComponent, ButtonLinkComponent],
  template: `
    <section class="card p-4 md:p-6 mt-6 flex flex-col gap-4 max-w-2xl" aria-labelledby="printer-title">
      <header>
        <h2 id="printer-title" class="text-base font-bold tracking-tight">Impresora de este equipo</h2>
        <p class="text-xs text-muted">Para imprimir el tiquete directo en la impresora térmica, sin la ventana de
          impresión, y abrir el cajón monedero. Se configura en cada computador de caja.</p>
      </header>

      @switch (agent.state()) {
        @case ('ready') {
          <p class="status ok" role="status"><i class="pi pi-check-circle" aria-hidden="true"></i>
            XASKA Impresora está funcionando{{ agent.version() ? ' (versión ' + agent.version() + ')' : '' }}.</p>
        }
        @case ('missing') {
          <div class="flex flex-col gap-2">
            <p class="status warn" role="status"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
              No encuentro XASKA Impresora en este computador.</p>
            <ol class="list-decimal pl-5 text-sm flex flex-col gap-1">
              <li>Descárgalo, guárdalo en una carpeta fija (por ejemplo Documentos) y ábrelo con doble clic (es para
                Windows). Si Windows avisa que es un programa desconocido, toca "Más información" → "Ejecutar de todas
                formas". Cuando pregunte si arranca con Windows, di que sí.</li>
              <li>Vuelve aquí y toca "Buscar de nuevo". Si el navegador pregunta si XASKA puede usar los
                dispositivos de este equipo, toca "Permitir".</li>
            </ol>
            <div class="flex flex-wrap gap-2">
              <a appButton [href]="download" download label="Descargar XASKA Impresora" icon="pi pi-download"></a>
              <app-button label="Buscar de nuevo" icon="pi pi-refresh" severity="secondary" [outlined]="true"
                        (clicked)="agent.check()" />
            </div>
          </div>
        }
        @default {
          <p class="text-sm text-muted" role="status">Buscando XASKA Impresora…</p>
        }
      }

      @if (agent.state() === 'ready') {
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Impresora</span>
            <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="agent.prefs().printer ?? ''"
                    (ngModelChange)="agent.update({ printer: $event || null })">
              <option value="">La predeterminada de Windows{{ agent.defaultPrinter() ? ' (' + agent.defaultPrinter() + ')' : '' }}</option>
              @for (p of agent.printers(); track p) {
                <option [value]="p">{{ p }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Ancho del papel</span>
            <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="width()" (ngModelChange)="setWidth($event)">
              <option [ngValue]="80">80 mm</option>
              <option [ngValue]="58">58 mm</option>
            </select>
          </label>
        </div>
        <div class="flex flex-col gap-2 text-sm">
          <label class="flex items-start gap-2">
            <input type="checkbox" class="size-4 mt-0.5" [ngModel]="agent.prefs().autoPrint"
                   (ngModelChange)="agent.update({ autoPrint: $event })" />
            <span>Imprimir el tiquete solo al cobrar <span class="text-muted">(sin tocar "Imprimir"; también se cambia en
              el cobro de Vender con "Tiquete al cobrar")</span></span>
          </label>
          <label class="flex items-start gap-2">
            <input type="checkbox" class="size-4 mt-0.5" [ngModel]="agent.prefs().drawerOnCash"
                   (ngModelChange)="agent.update({ drawerOnCash: $event })" />
            <span>Abrir el cajón al cobrar en efectivo <span class="text-muted">(con tarjeta o transferencia no se abre;
              volver a imprimir un tiquete tampoco)</span></span>
          </label>
          <label class="flex items-start gap-2">
            <input type="checkbox" class="size-4 mt-0.5" [ngModel]="agent.prefs().plain"
                   (ngModelChange)="agent.update({ plain: $event })" />
            <span>Imprimir sin tildes <span class="text-muted">(si en la prueba las tildes salen como símbolos raros)</span></span>
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <app-button label="Imprimir prueba" icon="pi pi-print" severity="secondary" [outlined]="true"
                    [loading]="busy() === 'test'" (clicked)="test()" />
          @if (canDrawer()) {
            <app-button label="Probar el cajón" icon="pi pi-inbox" severity="secondary" [outlined]="true"
                      [loading]="busy() === 'drawer'" (clicked)="drawer()" />
          }
          <app-button label="Buscar de nuevo" icon="pi pi-refresh" severity="secondary" [text]="true" (clicked)="agent.check()" />
        </div>
      }
    </section>
  `,
  styles: `
    .status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 600; }
    .status.ok { color: var(--success); }
    .status.warn { color: var(--warning-soft-text); }
  `,
})
export class PrinterSectionComponent implements OnInit {
  protected readonly agent = inject(PrintAgentService);
  private readonly drawerService = inject(CashDrawerService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly brandLogo = inject(BrandingService).logo;

  protected readonly download = AGENT_DOWNLOAD;
  protected readonly width = signal<ReceiptWidth>(loadReceiptWidth());
  protected readonly busy = signal<'test' | 'drawer' | null>(null);
  protected readonly canDrawer = computed(() => this.auth.hasPermission('cash:drawer'));

  ngOnInit(): void {
    void this.agent.check();
  }

  protected setWidth(value: ReceiptWidth | string): void {
    const w: ReceiptWidth = Number(value) === 58 ? 58 : 80;
    this.width.set(w);
    saveReceiptWidth(w);
  }

  protected async test(): Promise<void> {
    this.busy.set('test');
    try {
      const logo = await printableLogo(this.brandLogo(), this.width());
      await this.agent.print(testPageBytes(this.width(), this.agent.prefs().plain, this.agent.printerName() ?? '', logo),
        'Prueba XASKA');
      this.messages.add({ severity: 'success', summary: 'Prueba enviada', detail: this.agent.printerName() ?? '', life: 3000 });
    } catch (e: unknown) {
      this.fail('No se imprimió la prueba', e);
    } finally {
      this.busy.set(null);
    }
  }

  protected async drawer(): Promise<void> {
    this.busy.set('drawer');
    try {
      await this.drawerService.open('Prueba desde Ajustes');
      this.messages.add({ severity: 'success', summary: 'Cajón abierto', life: 2500 });
    } catch (e: unknown) {
      this.fail('No se abrió el cajón', e);
    } finally {
      this.busy.set(null);
    }
  }

  private fail(summary: string, e: unknown): void {
    this.messages.add({ severity: 'error', summary, detail: e instanceof Error ? e.message : String(e), life: 7000 });
  }
}
