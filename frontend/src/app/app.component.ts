import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { LoadingBarComponent } from './shared/loading-bar.component';
import { TourOverlayComponent } from './shared/tour/tour-overlay.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule, LoadingBarComponent, TourOverlayComponent],
  template: `
    <app-loading-bar />
    <p-toast position="top-right" />
    <p-confirmdialog />
    <router-outlet />
    <app-tour-overlay />
  `,
})
export class AppComponent {}
