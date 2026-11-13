import { TestBed } from '@angular/core/testing';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { ToastService } from './shared/ui/toast.service';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('se crea con los avisos, las confirmaciones y el router-outlet', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), provideNoopAnimations(), ToastService,
        provideServiceWorker('ngsw-worker.js', { enabled: false })],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('router-outlet')).not.toBeNull();
    expect(element.querySelector('app-toast-host')).not.toBeNull();
    expect(element.querySelector('app-confirm-host')).not.toBeNull();
  });
});
