import { TestBed } from '@angular/core/testing';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('se crea con el toast global y el router-outlet', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), provideNoopAnimations(), MessageService, ConfirmationService,
        provideServiceWorker('ngsw-worker.js', { enabled: false })],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('router-outlet')).not.toBeNull();
    expect(element.querySelector('p-toast')).not.toBeNull();
  });
});
