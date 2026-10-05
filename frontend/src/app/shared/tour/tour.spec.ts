import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { TourDefinition, markTourSeen, readSeenTours, toursKey } from './tour';
import { DASHBOARD_TOUR } from '../../features/dashboard/dashboard-tour';
import { POS_TOUR } from '../../features/pos/pos-tour';
import { TourService } from './tour.service';

const tour: TourDefinition = {
  id: 'pos',
  steps: [
    { target: 'a', title: 'Uno', text: '1' },
    { target: 'b', title: 'Dos', text: '2' },
    { target: null, title: 'Tres', text: '3' },
    { target: null, title: 'Cuatro', text: '4' },
    { target: null, title: 'Cinco', text: '5' },
    { target: null, title: 'Seis', text: '6' },
  ],
};

describe('recorridos guiados', () => {
  const key = toursKey('u-test');
  let saved: string | null;

  beforeEach(() => {
    saved = localStorage.getItem(key);
    localStorage.removeItem(key);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: signal({ id: 'u-test' }) } }],
    });
  });

  afterEach(() => {
    if (saved === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, saved);
    }
  });

  it('guarda los recorridos vistos sin repetir e ignora datos dañados', () => {
    markTourSeen(key, 'pos');
    markTourSeen(key, 'pos');
    expect(readSeenTours(key)).toEqual(['pos']);
    localStorage.setItem(key, '{dañado');
    expect(readSeenTours(key)).toEqual([]);
    localStorage.setItem(key, '["pos","otro",3]');
    expect(readSeenTours(key)).toEqual(['pos']);
  });

  it('se ofrece una sola vez, con máximo 5 pasos, y se puede repetir', () => {
    const service = TestBed.inject(TourService);
    service.offer(tour);
    expect(service.step()?.title).toBe('Uno');
    expect(service.active()?.tour.steps.length).toBe(5);

    service.previous();
    expect(service.step()?.title).toBe('Uno');
    service.next();
    expect(service.step()?.title).toBe('Dos');
    service.next();
    service.next();
    service.next();
    expect(service.step()?.title).toBe('Cinco');
    service.next();
    expect(service.active()).toBeNull();
    expect(service.hasSeen('pos')).toBeTrue();

    service.offer(tour);
    expect(service.active()).toBeNull();
    service.start(tour);
    expect(service.step()?.title).toBe('Uno');
    service.finish();
    expect(service.active()).toBeNull();
  });

  it('las pantallas reciben los pedidos de repetir', () => {
    const service = TestBed.inject(TourService);
    expect(service.replayRequests()).toBeNull();
    service.requestReplay('dashboard');
    service.requestReplay('dashboard');
    expect(service.replayRequests()).toEqual({ id: 'dashboard', seq: 2 });
  });

  it('atiende el pedido de repetir solo en la pantalla de ese recorrido', () => {
    const service = TestBed.inject(TourService);
    service.requestReplay('pos');
    expect(service.takeReplay(DASHBOARD_TOUR)).toBeFalse();
    expect(service.takeReplay(POS_TOUR)).toBeTrue();
    expect(service.step()?.title).toBe(POS_TOUR.steps[0].title);
    expect(service.replayRequests()).toBeNull();
    service.finish();
  });

  it('los recorridos de la app tienen como máximo 5 pasos', () => {
    for (const definition of [DASHBOARD_TOUR, POS_TOUR]) {
      expect(definition.steps.length).toBeLessThanOrEqual(5);
    }
  });
});
