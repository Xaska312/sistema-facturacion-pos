import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import { Subscription } from './api.models';

/** Suscripción del negocio actual (fase 8b). */
@Injectable({ providedIn: 'root' })
export class SubscriptionApi {
  private readonly http = inject(HttpClient);

  /** Plan, estado y fecha de fin; los pagos solo llegan con {@code settings:manage}. Sin aviso si falla. */
  current(): Observable<Subscription> {
    return this.http.get<Subscription>('/api/v1/subscription', {
      context: new HttpContext().set(SILENT_CLIENT_ERRORS, true),
    });
  }
}
