import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogComponent } from './dialog.component';

@Component({
  imports: [DialogComponent],
  template: `
    <button id="opener" type="button" (click)="open.set(true)">Abrir</button>
    <app-dialog [visible]="open()" (visibleChange)="open.set($event); changes = changes + 1" header="Nuevo cliente"
                [modal]="true" [style]="{ width: '30rem' }" [breakpoints]="{ '640px': '100vw' }"
                [dismissableMask]="dismissable" [closeOnEscape]="escape" (shown)="shown = shown + 1"
                (hidden)="hidden = hidden + 1">
      <input id="name" />
      <ng-template #footer><button id="save" type="button">Guardar</button></ng-template>
    </app-dialog>
  `,
})
class DialogHostComponent {
  readonly open = signal(false);
  dismissable = false;
  escape = true;
  changes = 0;
  shown = 0;
  hidden = 0;
}

describe('DialogComponent', () => {
  let fixture: ComponentFixture<DialogHostComponent>;
  let host: DialogHostComponent;
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('.ui-dialog');

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogHostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(root());
    fixture.detectChanges();
  });

  afterEach(() => {
    root().remove();
    document.body.classList.remove('ui-overflow-hidden');
  });

  function openDialog(): void {
    const opener = root().querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    opener.click();
    fixture.detectChanges();
  }

  it('cerrado no pinta nada; abierto es un diálogo modal con título, contenido y pie', () => {
    expect(panel()).toBeNull();
    openDialog();
    const dialog = panel()!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)!;
    expect(title.textContent).toBe('Nuevo cliente');
    expect(dialog.querySelector('.ui-dialog-content #name')).not.toBeNull();
    expect(dialog.querySelector('.ui-dialog-footer #save')).not.toBeNull();
    expect(dialog.querySelector('[aria-label="Cerrar"]')).not.toBeNull();
    expect(document.body.classList).toContain('ui-overflow-hidden');
  });

  it('al abrir pone el foco en el primer campo, avisa shown y queda en la capa de los diálogos', () => {
    openDialog();
    expect(document.activeElement?.id).toBe('name');
    expect(host.shown).toBe(1);
    expect(parseInt(panel()!.style.zIndex, 10)).toBeGreaterThan(1100);
  });

  it('la X y Escape solo avisan visibleChange; al cerrar devuelve el foco y avisa hidden', () => {
    openDialog();
    panel()!.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click();
    fixture.detectChanges();
    expect(host.changes).toBe(1);
    expect(panel()).toBeNull();
    expect(host.hidden).toBe(1);
    expect(document.activeElement?.id).toBe('opener');
    expect(document.body.classList).not.toContain('ui-overflow-hidden');

    openDialog();
    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('sin closeOnEscape, Escape no cierra', () => {
    host.escape = false;
    fixture.detectChanges();
    openDialog();
    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
  });

  it('el clic en el fondo cierra solo con dismissableMask', () => {
    openDialog();
    const mask = document.querySelector<HTMLElement>('.ui-dialog-mask')!;
    mask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    mask.click();
    fixture.detectChanges();
    expect(panel()).not.toBeNull();

    host.dismissable = true;
    fixture.detectChanges();
    mask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    mask.click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('usa el ancho pedido y el de breakpoints en pantallas angostas', () => {
    openDialog();
    const narrow = window.matchMedia('screen and (max-width: 640px)').matches;
    expect(panel()!.style.width).toBe(narrow ? '100vw' : '30rem');
  });
});
