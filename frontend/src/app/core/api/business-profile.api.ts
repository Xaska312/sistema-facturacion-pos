import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BusinessModule } from '../../shared/business-types';
import { BusinessType } from './api.models';

/** Tipo de negocio y módulos encendidos (Fase 12a, decisión 267). */
export interface BusinessProfile {
  businessType: BusinessType;
  modules: BusinessModule[];
  /** Solo el dueño los cambia. */
  canEdit: boolean;
}

@Injectable({ providedIn: 'root' })
export class BusinessProfileApi {
  private readonly http = inject(HttpClient);

  get(): Observable<BusinessProfile> {
    return this.http.get<BusinessProfile>('/api/v1/business-profile');
  }

  /** Después de guardar hay que renovar la sesión: los permisos de los módulos viajan en el token. */
  change(businessType: BusinessType, modules: readonly BusinessModule[]): Observable<BusinessProfile> {
    return this.http.put<BusinessProfile>('/api/v1/business-profile', { businessType, modules });
  }
}
