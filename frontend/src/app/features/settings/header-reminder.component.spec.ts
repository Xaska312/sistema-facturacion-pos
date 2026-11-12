import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { HeaderReminderComponent } from './header-reminder.component';

describe('Aviso del encabezado de los documentos (decisión 331)', () => {
  function render(header: string, canManage = true): HTMLElement {
    TestBed.configureTestingModule({
      imports: [HeaderReminderComponent],
      providers: [
        provideRouter([]),
        { provide: OrganizationApi, useValue: { settings: () => of({ receiptHeader: header }) } },
        { provide: AuthService, useValue: { hasPermission: () => canManage, currentTenant: () => ({ id: 't-encabezado' }) } },
      ],
    });
    const fixture = TestBed.createComponent(HeaderReminderComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => localStorage.removeItem('xaska.header-reminder.dismissed.t-encabezado'));

  it('invita al dueño cuando no ha escrito el encabezado', () => {
    expect(render('  \n ').textContent).toContain('Pon el NIT, la dirección y el celular');
  });

  it('no sale si ya lo escribió o si no maneja los ajustes', () => {
    expect(render('NIT: 900').textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    expect(render('', false).textContent?.trim()).toBe('');
  });

  it('"Ahora no" lo esconde en este equipo', () => {
    const el = render('');
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Ahora no')) as HTMLButtonElement).click();
    expect(localStorage.getItem('xaska.header-reminder.dismissed.t-encabezado')).toBe('1');
  });
});
