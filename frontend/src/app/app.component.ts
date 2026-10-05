import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { LoadingBarComponent } from './shared/loading-bar.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule, LoadingBarComponent],
  template: `
    <app-loading-bar />
    <p-toast position="top-right" />
    <p-confirmdialog />
    <router-outlet />
  `,
})
export class AppComponent {}
