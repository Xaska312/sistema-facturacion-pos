import { TestBed } from '@angular/core/testing';
import { STATUS, activeStatus, cashDifferenceStatus, isStatusKey } from './status';
import { StatusBadgeComponent } from './status-badge.component';

describe('status', () => {
  it('activo/inactivo con género', () => {
    expect(STATUS[activeStatus(true)].label).toBe('Activo');
    expect(STATUS[activeStatus(false, true)].label).toBe('Inactiva');
  });

  it('arqueo de caja según la diferencia', () => {
    expect(cashDifferenceStatus(-100)).toBe('cash-short');
    expect(cashDifferenceStatus(0)).toBe('cash-balanced');
    expect(cashDifferenceStatus(50)).toBe('cash-over');
  });

  it('reconoce las claves válidas', () => {
    expect(isStatusKey('voided')).toBeTrue();
    expect(isStatusKey('toString')).toBeFalse();
    expect(isStatusKey(3)).toBeFalse();
  });
});

describe('StatusBadgeComponent', () => {
  it('pinta el texto y el color del estado', () => {
    TestBed.configureTestingModule({ imports: [StatusBadgeComponent] });
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'voided');
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('span');
    expect(badge?.textContent?.trim()).toBe('Anulada');
    expect(badge?.className).toContain('bg-danger-soft');

    fixture.componentRef.setInput('label', 'Anulada por error');
    fixture.detectChanges();
    expect(badge?.textContent?.trim()).toBe('Anulada por error');
  });
});
