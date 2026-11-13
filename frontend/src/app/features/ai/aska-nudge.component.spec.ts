import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '../../shared/ui/toast.service';
import { AskaNudgeComponent } from './aska-nudge.component';
import { AskaMomentsState } from './aska-moments-state';

describe('AskaNudgeComponent (decisión 308)', () => {
  beforeEach(() => {
    localStorage.removeItem('xaska.aska-nudge.purchase');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ToastService],
    });
  });

  function render(moments: object, available = true) {
    TestBed.inject(AskaMomentsState).refresh();
    const fixture = TestBed.createComponent(AskaNudgeComponent);
    fixture.componentRef.setInput('moment', 'purchase');
    fixture.componentRef.setInput('available', available);
    fixture.componentRef.setInput('title', 'Vas en la línea 4 a mano');
    fixture.componentRef.setInput('withAi', 'Tómale una foto.');
    fixture.componentRef.setInput('withoutAi', 'Con XASKA IA, Aska lee la factura.');
    fixture.componentRef.setInput('action', 'Leer la factura');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/ai/moments').flush(
      { hasAi: false, canBuy: false, trialAvailable: false, emptyStock: false, ...moments });
    fixture.detectChanges();
    return fixture;
  }

  it('con XASKA IA ofrece hacerlo; sin el permiso o el cupo, no sale', () => {
    const el = render({ hasAi: true }).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Leer la factura');
    expect(el.textContent).toContain('Tómale una foto.');
    expect((render({ hasAi: true }, false).nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

  it('sin XASKA IA: la prueba gratis al dueño y "pídeselo al dueño" al resto', () => {
    expect((render({ canBuy: true, trialAvailable: true }).nativeElement as HTMLElement).textContent)
      .toContain('Probar gratis 14 días');
    const other = render({}).nativeElement as HTMLElement;
    expect(other.textContent).toContain('Pídele al dueño');
    expect(other.textContent).not.toContain('Probar gratis');
  });

  it('"Ahora no" lo cierra y avisa a la pantalla', () => {
    const fixture = render({ hasAi: true });
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    const now = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Ahora no'))!;
    now.click();
    fixture.detectChanges();
    expect(closed).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
