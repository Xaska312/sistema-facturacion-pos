import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Aska con quien escribe a XASKA, por WhatsApp (decisión 362) o por el chat de xaska.co (364). */
export type WaStatus = 'BOT' | 'HUMAN' | 'CLOSED';

export type WaChannel = 'WHATSAPP' | 'WEB';

export interface WaConversation {
  id: string;
  channel: WaChannel;
  /** Nulo en el chat de xaska.co y en WhatsApp para quien usa nombre de usuario (decisión 368). */
  phone: string | null;
  /** Identificador de usuario de WhatsApp (BSUID), cuando llegó. */
  waUserId: string | null;
  profileName: string | null;
  status: WaStatus;
  lastInboundAt: string | null;
  leadName: string | null;
  leadBusiness: string | null;
  leadCity: string | null;
  leadNeed: string | null;
  /** El WhatsApp que dejó quien escribió por la web. */
  leadPhone: string | null;
  handoffReason: string | null;
  handoffAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
}

export interface WaMessage {
  id: string;
  author: 'CUSTOMER' | 'BOT' | 'HUMAN';
  body: string;
  createdAt: string;
}

export interface WaDetail {
  conversation: WaConversation;
  windowOpen: boolean;
  messages: WaMessage[];
}

export interface WaState {
  receives: boolean;
  sends: boolean;
  ai: boolean;
}

@Injectable({ providedIn: 'root' })
export class WhatsAppApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/platform/whatsapp';

  state(): Observable<WaState> {
    return this.http.get<WaState>(`${this.base}/state`);
  }

  conversations(status: WaStatus | null): Observable<WaConversation[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<WaConversation[]>(`${this.base}/conversations`, { params });
  }

  detail(id: string): Observable<WaDetail> {
    return this.http.get<WaDetail>(`${this.base}/conversations/${id}`);
  }

  reply(id: string, text: string): Observable<WaDetail> {
    return this.http.post<WaDetail>(`${this.base}/conversations/${id}/reply`, { text });
  }

  /** take: la toma una persona · bot: vuelve al asistente · close: terminada. */
  action(id: string, action: 'take' | 'bot' | 'close'): Observable<WaDetail> {
    return this.http.post<WaDetail>(`${this.base}/conversations/${id}/${action}`, {});
  }
}
