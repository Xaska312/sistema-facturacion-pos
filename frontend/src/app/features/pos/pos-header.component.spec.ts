import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CashSession } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { PosHeaderComponent } from './pos-header.component';

describe('PosHeaderComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PosHeaderComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { hasPermission: () => false } }],
    });
  });

  const render = (session: CashSession | null, online = true) => {
    const fixture = TestBed.createComponent(PosHeaderComponent);
    fixture.componentRef.setInput('businessName', 'Tienda Demo');
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('userName', 'Ana Pérez');
    fixture.componentRef.setInput('online', online);
    fixture.detectChanges();
    return fixture;
  };

  it('muestra la caja abierta, la sucursal, el usuario y la conexión', () => {
    const session = {
      registerCode: 'CAJA-1', branchName: 'Principal', openedAt: new Date().toISOString(), openedByName: 'Ana Pérez',
    } as CashSession;
    const element = render(session).nativeElement as HTMLElement;
    const text = element.textContent ?? '';
    expect(text).toContain('Caja abierta');
    expect(text).toContain('desde');
    expect(text).toContain('CAJA-1 · Principal');
    expect(text).toContain('Ana Pérez');
    expect(text).toContain('En línea');
    const links = Array.from(element.querySelectorAll('a')).map((a) => a.textContent?.trim());
    expect(links).toContain('Caja');
    expect(links).not.toContain('Ventas');
  });

  it('avisa sin caja y sin conexión, y el botón de ayuda emite', () => {
    const fixture = render(null, false);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Caja cerrada');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Sin conexión');
    let help = 0;
    fixture.componentInstance.help.subscribe(() => help++);
    (element.querySelector('button[aria-label="Atajos de teclado"]') as HTMLButtonElement).click();
    expect(help).toBe(1);
  });
});
