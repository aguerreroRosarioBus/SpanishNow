import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { ChatConversationComponent } from './chat-conversation.component';
import { ChatService } from '../../../core/services/chat.service';
import { ChatBadgeService } from '../../../core/services/chat-badge.service';
import { ChatMessage, Conversation } from '../../../core/models/chat.model';
import { I18N_CATALOGS, I18nService, LOCALE_STORAGE_KEY } from '../../../core/i18n/i18n.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { CHAT_MESSAGES } from '../chat.i18n';

// Hallazgos de la revisión de Codex en #27: un test por hallazgo, cada uno falla sin su arreglo.

const conversation = (id: number, extra: Partial<Conversation> = {}): Conversation => ({
  id, role: 'student', counterpart: { id: 100 + id, name: `Docente ${id}`, role: 'teacher' }, context: null, lastMessage: null,
  lastMessageSeq: 1, lastMessageAt: '2026-10-22T13:00:00.000Z', lastReadSeq: 0, unreadCount: 0, teacherReplied: true,
  blockedByMe: false, blockedByOther: false, reportedByMe: false, createdAt: '2026-10-22T12:00:00.000Z', ...extra
});

const message = (seq: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: seq * 10, seq, type: 'text', senderId: 2, senderRole: 'teacher', mine: false, body: `Mensaje ${seq}`, hidden: false,
  clientMessageId: null, context: null, offerId: null, classSessionId: null, proposalVersion: null, eventCode: null,
  eventParams: null, createdAt: '2026-10-22T13:00:00.000Z', ...extra
});

/** Servidor falso: historial por conversación y cursores como el backend (siempre ascendente). */
function fakeServer() {
  const history = new Map<number, ChatMessage[]>();
  const meta = new Map<number, Conversation>();
  const page = (id: number, cursor: { beforeSeq?: number; afterSeq?: number } = {}, limit = 30) => {
    let items = history.get(id) ?? [];
    if (cursor.afterSeq !== undefined) items = items.filter(m => m.seq > cursor.afterSeq!).slice(0, limit);
    else {
      if (cursor.beforeSeq !== undefined) items = items.filter(m => m.seq < cursor.beforeSeq!);
      items = items.slice(-limit);
    }
    return { items, hasMore: false };
  };
  return { history, meta, page };
}

type Api = Record<string, ReturnType<typeof vi.fn>>;

async function setup(server = fakeServer(), overrides: Partial<Api> = {}, extraCatalog?: unknown) {
  const route = new BehaviorSubject<ParamMap>(convertToParamMap({ id: '7' }));
  const sends: Subject<ChatMessage>[] = [];
  const api: Api = {
    get: vi.fn((id: number) => of(server.meta.get(id) ?? conversation(id))),
    messages: vi.fn((id: number, cursor?: { beforeSeq?: number; afterSeq?: number }, limit?: number) => of(server.page(id, cursor, limit))),
    markRead: vi.fn(() => of({ lastReadSeq: 0 })),
    send: vi.fn(() => { const s = new Subject<ChatMessage>(); sends.push(s); return s; }),
    block: vi.fn(), unblock: vi.fn(), report: vi.fn(),
    ...overrides
  };
  await TestBed.configureTestingModule({
    imports: [ChatConversationComponent],
    providers: [
      provideRouter([]),
      { provide: I18N_CATALOGS, multi: true, useValue: CHAT_MESSAGES },
      ...(extraCatalog ? [{ provide: I18N_CATALOGS, multi: true, useValue: extraCatalog }] : []),
      { provide: UserPreferencesService, useValue: { preferences: signal({ locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: null }) } },
      { provide: ChatService, useValue: api },
      { provide: ChatBadgeService, useValue: { refresh: vi.fn() } },
      { provide: ActivatedRoute, useValue: { paramMap: route } }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(ChatConversationComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const component = fixture.componentInstance;
  const poll = () => (component as unknown as { poll(): void }).poll();
  return { fixture, component, api, sends, route, server, poll };
}

describe('ChatConversationComponent — revisión de #27', () => {
  beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'es'));
  afterEach(() => { localStorage.removeItem(LOCALE_STORAGE_KEY); TestBed.resetTestingModule(); });

  it('P1 · el cursor de polling no salta mensajes ajenos cuando se confirma un envío propio (CHAT-03/06)', async () => {
    const server = fakeServer();
    server.history.set(7, [message(1)]);
    const { fixture, component, sends, api, poll } = await setup(server);
    component.draft.set('Hola');
    component.send();
    // Mientras tanto el docente escribe seq 2 y el envío del alumno se confirma como seq 3.
    const mine = message(3, { mine: true, senderId: 1, senderRole: 'student', body: 'Hola' });
    server.history.set(7, [message(1), message(2), mine]);
    sends[0].next(mine);
    expect(api['markRead']).not.toHaveBeenCalledWith(7, 3); // no se marca leído lo que no se mostró
    poll();
    expect(api['messages']).toHaveBeenLastCalledWith(7, { afterSeq: 1 }, 100);
    expect(component.messages().map(m => m.seq)).toEqual([1, 2, 3]);
    fixture.destroy();
  });

  it('P1 · al cambiar de conversación por ruta, una respuesta tardía de la anterior no pisa la actual (CHAT-02)', async () => {
    const server = fakeServer();
    server.history.set(7, [message(1, { body: 'Privado de A' })]);
    server.history.set(8, [message(1, { body: 'Mensaje de B' })]);
    const lateA = new Subject<Conversation>();
    const { fixture, component, api, route, sends } = await setup(server, {});
    // Reabrir A con un GET lento y pasar a B antes de que llegue.
    api['get'].mockImplementation((id: number) => (id === 7 ? lateA : of(conversation(8))));
    route.next(convertToParamMap({ id: '7' }));
    route.next(convertToParamMap({ id: '8' }));
    lateA.next(conversation(7));
    lateA.complete();
    fixture.detectChanges();
    expect(component.conversationId).toBe(8);
    expect(component.conversation()?.id).toBe(8);
    expect(component.messages().map(m => m.body)).toEqual(['Mensaje de B']);
    // Un envío de A confirmado tarde tampoco aparece en B.
    expect(sends).toHaveLength(0);
    fixture.destroy();
  });

  it('P1 · un envío en curso de la conversación anterior no se mezcla en la nueva', async () => {
    const server = fakeServer();
    server.history.set(7, [message(1)]);
    server.history.set(8, [message(1, { body: 'Mensaje de B' })]);
    const { fixture, component, route, sends } = await setup(server);
    component.draft.set('Para A');
    component.send();
    route.next(convertToParamMap({ id: '8' }));
    expect(component.draft()).toBe('');
    sends[0].next(message(2, { mine: true, body: 'Para A' }));
    expect(component.messages().map(m => m.body)).toEqual(['Mensaje de B']);
    fixture.destroy();
  });
});
