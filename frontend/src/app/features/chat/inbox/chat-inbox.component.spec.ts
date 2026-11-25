import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatInboxComponent } from './chat-inbox.component';
import { ChatService } from '../../../core/services/chat.service';
import { ChatBadgeService } from '../../../core/services/chat-badge.service';
import { I18N_CATALOGS } from '../../../core/i18n/i18n.service';
import { CHAT_MESSAGES } from '../chat.i18n';
import { PACKAGE_MESSAGES } from '../../packages/packages.i18n';
import { SCHEDULE_MESSAGES } from '../../schedule/schedule.messages';
import { Conversation } from '../../../core/models/chat.model';

const conversation = (id: number, lastMessage: Record<string, unknown>): Conversation => ({
  id, role: 'student', counterpart: { id: 5, name: `Docente ${id}`, role: 'teacher' }, context: null, lastMessageAt: '2026-11-20T15:00:00Z',
  lastMessage: { seq: 1, senderIsMe: false, hidden: false, createdAt: '2026-11-20T15:00:00Z', preview: null, eventCode: null, type: 'text', ...lastMessage }
} as unknown as Conversation);

describe('D-13: la bandeja muestra qué dijo el último mensaje', () => {
  beforeEach(() => {
    localStorage.clear(); localStorage.setItem('spanishnow.locale', 'es');
    localStorage.setItem('token', 't'); localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Ana', email: 'a@example.test', role: 'teacher' }));
    const items = [
      conversation(1, { type: 'text', preview: 'Hola, ¿tenemos clase el martes?' }),
      conversation(2, { type: 'system_event', eventCode: 'session_confirmed' }),
      conversation(3, { type: 'system_event', eventCode: 'codigo_desconocido' }),
      conversation(4, { type: 'offer' })
    ];
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: I18N_CATALOGS, multi: true, useValue: CHAT_MESSAGES }, { provide: I18N_CATALOGS, multi: true, useValue: PACKAGE_MESSAGES }, { provide: I18N_CATALOGS, multi: true, useValue: SCHEDULE_MESSAGES },
      { provide: ChatService, useValue: { list: () => of({ items, nextCursor: null }), availableTeachers: () => of([]) } },
      { provide: ChatBadgeService, useValue: { refresh() {} } }] });
  });

  it('un evento del sistema muestra su texto y no solo «Aviso del sistema»', () => {
    const f = TestBed.createComponent(ChatInboxComponent); f.detectChanges();
    const previews = [...f.nativeElement.querySelectorAll('.row-preview')].map((e: Element) => e.textContent?.trim());
    expect(previews[0]).toBe('Hola, ¿tenemos clase el martes?');
    expect(previews[1]).toBe('La clase fue confirmada.'); // schedule.event.session_confirmed
    expect(previews[2]).toBe('Actualización de la conversación');
    expect(previews[3]).toBe('Oferta de clases');
  });
});
