import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [EmptyStateComponent] }));

  it('muestra título, mensaje y la acción principal', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('title', 'Aún no hay productos');
    fixture.componentRef.setInput('message', 'Crea el primero o impórtalos desde un CSV.');
    fixture.componentRef.setInput('actionLabel', 'Crear producto');
    let clicked = false;
    fixture.componentInstance.action.subscribe(() => (clicked = true));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Aún no hay productos');
    expect(element.textContent).toContain('CSV');
    element.querySelector('button')?.click();
    expect(clicked).toBeTrue();
  });

  it('sin acción no muestra botón', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('title', 'Sin movimientos');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });
});
