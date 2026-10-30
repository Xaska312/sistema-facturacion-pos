import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { XaskaLogoComponent } from '../brand/xaska-logo.component';
import { XIconComponent } from '../icons/xicon.component';
import { XIconName } from '../icons/xicons';

interface BrandTile {
  glyph: XIconName;
  label: string;
}

/** Lo que muestra el panel de marca: las tareas del día a día con los íconos propios. */
const BRAND_TILES: readonly BrandTile[] = [
  { glyph: 'sell', label: 'Vender' },
  { glyph: 'cash', label: 'Caja' },
  { glyph: 'credit', label: 'Fiados' },
  { glyph: 'stock', label: 'Inventario' },
];

/**
 * Marco de las pantallas fuera del negocio (entrada, registro, claves, correo, invitaciones, elegir o crear negocio,
 * condiciones), con la identidad de XASKA (decisión 264): a la izquierda un panel en baldosa con el logo, la frase y
 * los íconos propios; a la derecha el contenido, centrado. En el celular el panel queda arriba, solo con el logo.
 * Los colores del panel son los de XASKA ({@code --xaska-panel*}), no los del negocio.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [XaskaLogoComponent, XIconComponent],
  template: `
    <div class="auth">
      <aside class="auth-brand">
        <app-xaska-logo [wordmark]="true" [tag]="true" size="lg" label="XASKA POS" />
        <div class="auth-pitch">
          <p class="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.05]">
            El punto de venta<br />de tu negocio.
          </p>
          <p class="mt-4 text-lg auth-muted max-w-md">
            Vende, cobra, fía y controla tu inventario desde el computador, la tableta o el celular.
          </p>
        </div>
        <ul class="auth-tiles" aria-hidden="true">
          @for (t of tiles; track t.glyph) {
            <li class="auth-tile">
              <app-xicon [name]="t.glyph" [size]="34" />
              <span class="font-bold">{{ t.label }}</span>
            </li>
          }
        </ul>
        <p class="auth-foot text-sm auth-muted">Hecho en Colombia · xaska.co</p>
      </aside>
      <main class="auth-main">
        <div class="auth-slot" [class.auth-slot--md]="width() === 'md'" [class.auth-slot--lg]="width() === 'lg'">
          <ng-content />
        </div>
      </main>
    </div>
  `,
  styles: `
    .auth {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .auth-brand {
      --xaska-ink: var(--xaska-panel-fg);
      --xicon-fill: var(--xaska-dot-on-tile);
      margin: 0.75rem 0.75rem 0;
      padding: 1rem 1.25rem;
      border-radius: 1.5rem;
      background: linear-gradient(160deg, var(--xaska-panel), var(--xaska-panel-2));
      color: var(--xaska-panel-fg);
      display: flex;
      align-items: center;
    }
    .auth-pitch,
    .auth-tiles,
    .auth-foot {
      display: none;
    }
    .auth-muted { color: var(--xaska-panel-muted); }
    .auth-main {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem 1rem 2.5rem;
    }
    .auth-slot { width: 100%; max-width: 26rem; }
    .auth-slot--md { max-width: 30rem; }
    .auth-slot--lg { max-width: 38rem; }
    @media (min-width: 1024px) {
      .auth {
        grid-template-rows: none;
        grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
      }
      .auth-brand {
        position: sticky;
        top: 0;
        height: calc(100vh - 2rem);
        margin: 1rem 0 1rem 1rem;
        padding: 2.5rem 2.75rem;
        border-radius: 2rem;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        gap: 2rem;
      }
      .auth-pitch { display: block; }
      .auth-tiles {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .auth-foot { display: block; }
      .auth-main { padding: 2rem; }
    }
    .auth-tile {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 1.125rem 1.25rem;
      border-radius: 1.25rem;
      background: var(--xaska-panel-tile);
      border: 1px solid var(--xaska-panel-line);
    }
  `,
})
export class AuthLayoutComponent {
  /** Ancho del contenido: sm (entrada), md (registro, invitación) o lg (elegir o crear negocio). */
  readonly width = input<'sm' | 'md' | 'lg'>('sm');

  protected readonly tiles = BRAND_TILES;
}
