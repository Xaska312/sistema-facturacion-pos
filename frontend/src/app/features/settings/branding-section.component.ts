import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Branding, BrandingApi } from '../../core/api/branding.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { BRAND_PALETTES, DEFAULT_BRAND, applyBrandColor } from '../../core/theme/brand-palettes';
import { BrandingService } from '../../core/theme/branding.service';
import { ThemeService } from '../../core/theme/theme.service';
import { shrinkImage } from '../../shared/image-shrink';

/**
 * Ajustes → Marca (fase 8c): logo pequeño para el encabezado y el tiquete, y color de una paleta cerrada. Al tocar un
 * color se ve de inmediato en toda la app; "Guardar color" lo deja para todo el equipo.
 */
@Component({
  selector: 'app-branding-section',
  imports: [ButtonModule],
  template: `
    <section class="card p-4 md:p-6 mt-6 flex flex-col gap-5 max-w-2xl" aria-labelledby="branding-title">
      <div>
        <h2 id="branding-title" class="text-base font-semibold">Marca</h2>
        <p class="text-sm text-muted">Tu logo sale en el encabezado y en el tiquete; el color, en botones y enlaces de todo el equipo.</p>
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <div class="size-20 rounded-lg border border-line bg-surface-alt flex items-center justify-center overflow-hidden">
          @if (logo(); as src) {
            <img [src]="src" alt="Logo del negocio" class="max-w-full max-h-full object-contain" />
          } @else {
            <i class="pi pi-image text-2xl text-muted" aria-hidden="true"></i>
          }
        </div>
        @if (canManage()) {
          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap gap-2">
              <label class="p-button p-button-outlined p-button-sm cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                     [class.p-disabled]="savingLogo()">
                <i class="pi pi-upload" aria-hidden="true"></i>
                <span class="p-button-label">{{ logo() ? 'Cambiar logo' : 'Subir logo' }}</span>
                <input type="file" class="sr-only" accept="image/png,image/jpeg,image/webp" [disabled]="savingLogo()"
                       aria-describedby="logo-hint" (change)="pickLogo($event)" />
              </label>
              @if (logo()) {
                <p-button label="Quitar" icon="pi pi-trash" size="small" severity="danger" [text]="true"
                          [disabled]="savingLogo()" (onClick)="removeLogo()" />
              }
            </div>
            <small id="logo-hint" class="text-xs text-muted">PNG, JPG o WebP. Se reduce solo; mejor con fondo blanco o transparente.</small>
          </div>
        }
      </div>

      @if (canManage()) {
        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-medium mb-2">Color</legend>
          <div class="flex flex-wrap gap-2">
            @for (p of palettes; track p.id) {
              <label class="swatch has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                     [class.swatch-on]="chosen() === p.id">
                <input type="radio" name="brand-color" class="sr-only" [value]="p.id" [checked]="chosen() === p.id"
                       (change)="preview(p.id)" />
                <span class="swatch-dot" [style.background]="dark() ? p.dark : p.light" aria-hidden="true"></span>
                <span class="text-sm">{{ p.label }}</span>
              </label>
            }
          </div>
          @if (chosen() !== saved()) {
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <p-button label="Guardar color" icon="pi pi-check" size="small" [loading]="savingColor()" (onClick)="saveColor()" />
              <p-button label="Deshacer" size="small" severity="secondary" [text]="true" (onClick)="preview(saved())" />
              <small class="text-xs text-muted">Así se verá. Guárdalo para que lo vea todo el equipo.</small>
            </div>
          }
        </fieldset>
      } @else {
        <p class="text-sm">Color: <span class="font-medium">{{ savedLabel() }}</span></p>
      }
    </section>
  `,
  styles: `
    .swatch {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: 0 0.875rem 0 0.5rem;
      border-radius: 9999px;
      border: 1px solid var(--surface-border);
      background: var(--surface);
    }
    .swatch {
      cursor: pointer;
    }
    .swatch-on {
      border-color: var(--text);
      box-shadow: 0 0 0 1px var(--text);
    }
    .swatch-dot {
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 9999px;
    }
  `,
})
export class BrandingSectionComponent implements OnDestroy {
  private readonly api = inject(BrandingApi);
  private readonly branding = inject(BrandingService);
  private readonly theme = inject(ThemeService);
  private readonly messages = inject(MessageService);
  protected readonly canManage = permissionFlag('settings:manage');

  protected readonly palettes = BRAND_PALETTES;
  protected readonly logo = this.branding.logo;
  protected readonly saved = computed(() => this.branding.branding()?.color ?? DEFAULT_BRAND);
  private readonly previewed = signal<string | null>(null);
  protected readonly chosen = computed(() => this.previewed() ?? this.saved());
  protected readonly savedLabel = computed(() => BRAND_PALETTES.find((p) => p.id === this.saved())?.label ?? 'Índigo');
  protected readonly dark = computed(() => this.theme.isDark());
  protected readonly savingColor = signal(false);
  protected readonly savingLogo = signal(false);

  /** Se ve en la app al instante; si no se guarda, al salir de Ajustes vuelve el color guardado. */
  protected preview(color: string): void {
    this.previewed.set(color === this.saved() ? null : color);
    applyBrandColor(color);
  }

  protected saveColor(): void {
    const color = this.chosen();
    this.savingColor.set(true);
    this.api.setColor(color).subscribe({
      next: (branding) => {
        this.savingColor.set(false);
        this.previewed.set(null);
        this.branding.use(branding);
        this.messages.add({ severity: 'success', summary: 'Color guardado', life: 3000 });
      },
      error: () => this.savingColor.set(false),
    });
  }

  protected async pickLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.savingLogo.set(true);
    try {
      const dataUrl = await shrinkImage(file);
      this.api.setLogo(dataUrl).subscribe({
        next: (branding) => {
          this.savingLogo.set(false);
          this.apply(branding);
          this.messages.add({ severity: 'success', summary: 'Logo guardado', life: 3000 });
        },
        error: () => this.savingLogo.set(false),
      });
    } catch (error) {
      this.savingLogo.set(false);
      this.messages.add({ severity: 'warn', summary: 'No se pudo usar la imagen',
        detail: error instanceof Error ? error.message : 'Prueba con otra imagen.' });
    }
  }

  protected removeLogo(): void {
    this.savingLogo.set(true);
    this.api.removeLogo().subscribe({
      next: (branding) => {
        this.savingLogo.set(false);
        this.apply(branding);
      },
      error: () => this.savingLogo.set(false),
    });
  }

  /** Aplica la marca guardada sin perder un color que se está probando. */
  private apply(branding: Branding): void {
    this.branding.use(branding);
    const previewed = this.previewed();
    if (previewed) {
      applyBrandColor(previewed);
    }
  }

  /** Al salir de Ajustes sin guardar, vuelve el color guardado. */
  ngOnDestroy(): void {
    if (this.previewed()) {
      applyBrandColor(this.saved());
    }
  }
}
