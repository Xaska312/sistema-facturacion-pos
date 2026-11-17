import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { WaDetail, WhatsAppApi } from '../../core/api/whatsapp.api';
import { PlatformWhatsAppComponent } from './platform-whatsapp.component';

describe('PlatformWhatsAppComponent (decisión 362)', () => {
  const conversation = {
    id: 'c1', phone: '573001112233', profileName: 'Marta', status: 'HUMAN' as const, lastInboundAt: new Date().toISOString(),
    leadName: 'Marta', leadBusiness: 'Tienda Marta', leadCity: 'Ibagué', leadNeed: null,
    handoffReason: 'Quiere cotizar equipos', handoffAt: null, createdAt: '2026-11-17T10:00:00Z',
    updatedAt: '2026-11-17T10:05:00Z', lastMessage: 'Quiero cotizar',
  };
  const detail: WaDetail = {
    conversation, windowOpen: true,
    messages: [
      { id: 'm1', author: 'CUSTOMER', body: 'Quiero cotizar', createdAt: '2026-11-17T10:00:00Z' },
      { id: 'm2', author: 'BOT', body: 'Te paso con una persona', createdAt: '2026-11-17T10:01:00Z' },
    ],
  };
  let api: jasmine.SpyObj<WhatsAppApi>;

  beforeEach(() => {
    api = jasmine.createSpyObj<WhatsAppApi>('WhatsAppApi', ['state', 'conversations', 'detail', 'reply', 'action']);
    api.state.and.returnValue(of({ receives: true, sends: true, ai: true }));
    api.conversations.and.returnValue(of([conversation]));
    api.detail.and.returnValue(of(detail));
    api.reply.and.returnValue(of(detail));
    TestBed.configureTestingModule({
      imports: [PlatformWhatsAppComponent],
      providers: [provideRouter([]), { provide: WhatsAppApi, useValue: api }],
    });
  });

  it('lista las conversaciones, abre una y responde', () => {
    const fixture = TestBed.createComponent(PlatformWhatsAppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Con una persona');
    expect(el.textContent).toContain('Tienda Marta · Ibagué');
    (el.querySelector('.wa-item') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.wa-msg').length).toBe(2);
    expect(el.textContent).toContain('Pasó a una persona: Quiere cotizar equipos');
    expect(el.querySelector('textarea')).not.toBeNull();
    (fixture.componentInstance as unknown as { draft: string }).draft = '  Hola Marta ';
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(api.reply).toHaveBeenCalledWith('c1', 'Hola Marta');
    fixture.destroy();
  });

  it('avisa cuando WhatsApp no está configurado', () => {
    api.state.and.returnValue(of({ receives: false, sends: false, ai: true }));
    const fixture = TestBed.createComponent(PlatformWhatsAppComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('WHATSAPP_');
    fixture.destroy();
  });
});
