import { TestBed } from '@angular/core/testing';
import { OnlineService } from './online.service';

describe('OnlineService', () => {
  it('sigue los eventos online/offline del navegador', () => {
    const service = TestBed.inject(OnlineService);
    window.dispatchEvent(new Event('offline'));
    expect(service.online()).toBeFalse();
    window.dispatchEvent(new Event('online'));
    expect(service.online()).toBeTrue();
  });
});
