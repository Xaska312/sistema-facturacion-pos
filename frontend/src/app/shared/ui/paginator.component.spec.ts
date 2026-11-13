import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageChange, PaginatorComponent } from './paginator.component';

@Component({
  imports: [PaginatorComponent],
  template: `
    <app-paginator [first]="first" [rows]="20" [totalRecords]="312" [rowsPerPageOptions]="[20, 50, 100]"
                   [pageLinkSize]="links" (pageChange)="last = $event" />
  `,
})
class PaginatorHostComponent {
  first = 20;
  links = 3;
  last: PageChange | null = null;
}

describe('PaginatorComponent', () => {
  let fixture: ComponentFixture<PaginatorHostComponent>;
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const pages = (): string[] => [...root().querySelectorAll('.ui-paginator-page')].map((b) => b.textContent!.trim());
  const nav = (label: string): HTMLButtonElement => root().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

  beforeEach(() => {
    fixture = TestBed.createComponent(PaginatorHostComponent);
    fixture.detectChanges();
  });

  it('muestra los números alrededor de la página actual, marcada', () => {
    expect(pages()).toEqual(['1', '2', '3']);
    const current = root().querySelector('[aria-current="page"]')!;
    expect(current.textContent!.trim()).toBe('2');
    expect(current.classList).toContain('ui-paginator-page-selected');
    fixture.componentInstance.first = 200;
    fixture.componentInstance.links = 5;
    fixture.detectChanges();
    expect(pages()).toEqual(['9', '10', '11', '12', '13']);
  });

  it('avisa el cambio de página con first, rows y page', () => {
    nav('Página siguiente').click();
    expect(fixture.componentInstance.last).toEqual({ first: 40, rows: 20, page: 2, pageCount: 16 });
    nav('Última página').click();
    expect(fixture.componentInstance.last!.page).toBe(15);
  });

  it('en la primera página, primera y anterior quedan desactivadas', () => {
    fixture.componentInstance.first = 0;
    fixture.detectChanges();
    expect(nav('Primera página').disabled).toBeTrue();
    expect(nav('Página anterior').disabled).toBeTrue();
    expect(nav('Página siguiente').disabled).toBeFalse();
  });

  it('cambiar filas por página vuelve a la primera', () => {
    const select = root().querySelector<HTMLSelectElement>('select[aria-label="Filas por página"]')!;
    expect(root().querySelector('.ui-select-label')!.textContent!.trim()).toBe('20');
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.last).toEqual({ first: 0, rows: 50, page: 0, pageCount: 7 });
  });
});
