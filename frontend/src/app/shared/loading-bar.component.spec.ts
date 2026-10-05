import { TestBed } from '@angular/core/testing';
import { LoadingService } from '../core/loading/loading';
import { LoadingBarComponent } from './loading-bar.component';

describe('LoadingBarComponent', () => {
  it('muestra la barra solo mientras hay peticiones en curso', () => {
    TestBed.configureTestingModule({ imports: [LoadingBarComponent] });
    const fixture = TestBed.createComponent(LoadingBarComponent);
    const loading = TestBed.inject(LoadingService);
    const element = fixture.nativeElement as HTMLElement;

    fixture.detectChanges();
    expect(element.querySelector('[role="progressbar"]')).toBeNull();

    loading.start();
    fixture.detectChanges();
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Cargando');

    loading.stop();
    fixture.detectChanges();
    expect(element.querySelector('[role="progressbar"]')).toBeNull();
  });
});
