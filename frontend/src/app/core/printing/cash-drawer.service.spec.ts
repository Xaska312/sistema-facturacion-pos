import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { CashApi } from '../api/cash.api';
import { AuthService } from '../auth/auth.service';
import { OfflineDrawerService } from '../offline/offline-drawer.service';
import { OfflineSalesService } from '../offline/offline-sales.service';
import { CashDrawerService } from './cash-drawer.service';
import { PrintAgentService } from './print-agent.service';

describe('CashDrawerService (decisión 352)', () => {
  const agent = { ensure: jasmine.createSpy('ensure'), openDrawer: jasmine.createSpy('openDrawer') };
  const cash = { drawerOpened: jasmine.createSpy('drawerOpened') };
  const offline = signal(false);
  const sales = { offline, noteNetworkError: jasmine.createSpy('noteNetworkError') };
  const drawer = { record: jasmine.createSpy('record') };
  const auth = { offlineBoot: signal(false) };

  beforeEach(() => {
    agent.ensure.and.resolveTo(true);
    agent.openDrawer.calls.reset();
    agent.openDrawer.and.resolveTo();
    cash.drawerOpened.calls.reset();
    drawer.record.calls.reset();
    drawer.record.and.resolveTo();
    offline.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: PrintAgentService, useValue: agent },
        { provide: CashApi, useValue: cash },
        { provide: OfflineSalesService, useValue: sales },
        { provide: OfflineDrawerService, useValue: drawer },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  it('con internet registra primero y después abre', async () => {
    cash.drawerOpened.and.returnValue(of(undefined));
    await TestBed.inject(CashDrawerService).open('Cambio');
    expect(cash.drawerOpened).toHaveBeenCalledWith('Cambio');
    expect(agent.openDrawer).toHaveBeenCalled();
    expect(drawer.record).not.toHaveBeenCalled();
  });

  it('sin internet abre de una vez y guarda el registro para después', async () => {
    offline.set(true);
    await TestBed.inject(CashDrawerService).open(null);
    expect(cash.drawerOpened).not.toHaveBeenCalled();
    expect(agent.openDrawer).toHaveBeenCalled();
    expect(drawer.record).toHaveBeenCalledWith(null);
  });

  it('si el servidor no responde, también abre y lo guarda', async () => {
    cash.drawerOpened.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await TestBed.inject(CashDrawerService).open(null);
    expect(sales.noteNetworkError).toHaveBeenCalled();
    expect(agent.openDrawer).toHaveBeenCalled();
    expect(drawer.record).toHaveBeenCalled();
  });

  it('si el servidor lo niega (sin caja abierta), no abre', async () => {
    cash.drawerOpened.and.returnValue(throwError(() => new HttpErrorResponse({ status: 422,
      error: { detail: 'Abre la caja antes de abrir el cajón.' } })));
    await expectAsync(TestBed.inject(CashDrawerService).open(null)).toBeRejectedWithError(/Abre la caja/);
    expect(agent.openDrawer).not.toHaveBeenCalled();
  });
});
