import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { ChatConversationComponent, linkSegments } from './chat-conversation.component';
import { ChatService } from '../../../core/services/chat.service';
import { ChatBadgeService } from '../../../core/services/chat-badge.service';
import { ChatMessage, Conversation } from '../../../core/models/chat.model';
import { signal } from '@angular/core';
import { I18N_CATALOGS, LOCALE_STORAGE_KEY } from '../../../core/i18n/i18n.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { CHAT_MESSAGES } from '../chat.i18n';

const i18nProviders = [
  { provide: I18N_CATALOGS, multi: true, useValue: CHAT_MESSAGES },
  { provide: UserPreferencesService, useValue: { preferences: signal({ locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: null }) } }
];
beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'es'));
afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

const conversation = (extra: Partial<Conversation> = {}): Conversation => ({
  id: 7, role: 'student', counterpart: { id: 2, name: 'Solange', role: 'teacher' }, context: null, lastMessage: null,
  lastMessageSeq: 2, lastMessageAt: '2026-10-22T13:00:00.000Z', lastReadSeq: 0, unreadCount: 1, teacherReplied: true,
  blockedByMe: false, blockedByOther: false, reportedByMe: false, createdAt: '2026-10-22T12:00:00.000Z', ...extra
});

const message = (seq: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: seq * 10, seq, type: 'text', senderId: 2, senderRole: 'teacher', mine: false, body: `Mensaje ${seq}`, hidden: false,
  clientMessageId: null, context: null, offerId: null, classSessionId: null, proposalVersion: null, eventCode: null,
  eventParams: null, createdAt: '2026-10-22T13:00:00.000Z', ...extra
});

describe('linkSegments (CHAT-05: enlaces seguros en texto plano)', () => {
  it('separa solo enlaces http(s) y deja afuera la puntuación final', () => {
    expect(linkSegments('mirá https://spanishnow.ar/cursos. <b>ok</b> javascript:alert(1)')).toEqual([
      { text: 'mirá ', href: null },
      { text: 'https://spanishnow.ar/cursos', href: 'https://spanishnow.ar/cursos' },
      { text: '. <b>ok</b> javascript:alert(1)', href: null }
    ]);
    expect(linkSegments('sin enlaces')).toEqual([{ text: 'sin enlaces', href: null }]);
  });
});

describe('ChatConversationComponent (CHAT-03/06)', () => {
  let sends: Subject<ChatMessage>[];
  let api: Record<string, ReturnType<typeof vi.fn>>;

  async function create(messages: ChatMessage[] = [message(1), message(2)], conv = conversation()) {
    sends = [];
    api = {
      get: vi.fn(() => of(conv)),
      messages: vi.fn(() => of({ items: messages, hasMore: false })),
      markRead: vi.fn(() => of({ lastReadSeq: 2 })),
      send: vi.fn(() => { const s = new Subject<ChatMessage>(); sends.push(s); return s; }),
      block: vi.fn(() => of(conversation({ blockedByMe: true }))),
      unblock: vi.fn(() => of(conversation())),
      report: vi.fn(() => of(conversation({ reportedByMe: true, blockedByMe: true })))
    };
    await TestBed.configureTestingModule({
      imports: [ChatConversationComponent],
      providers: [
        provideRouter([]),
        ...i18nProviders,
        { provide: ChatService, useValue: api },
        { provide: ChatBadgeService, useValue: { refresh: vi.fn() } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: '7' })) } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(ChatConversationComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('muestra el historial como texto plano y marca leído hasta el último seq', async () => {
    const fixture = await create([message(1, { body: '<img src=x onerror=alert(1)>' }), message(2)]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(api['markRead']).toHaveBeenCalledWith(7, 2);
    fixture.destroy();
  });

  it('un envío fallido queda como «No se envió» y el reintento usa el mismo clientMessageId', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.draft.set('Hola, ¿tenés horarios los martes?');
    component.send();
    expect(component.draft()).toBe('');
    expect(component.pending()[0].status).toBe('sending');
    const firstId = api['send'].mock.calls[0][1];

    sends[0].error(new HttpErrorResponse({ status: 0 }));
    expect(component.pending()[0]).toMatchObject({ status: 'failed', final: false });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se envió');

    component.retry(component.pending()[0]);
    expect(api['send'].mock.calls[1][1]).toBe(firstId);
    sends[1].next(message(3, { mine: true, senderId: 1, senderRole: 'student', body: 'Hola, ¿tenés horarios los martes?', clientMessageId: firstId }));
    expect(component.pending()).toEqual([]);
    expect(component.messages().map(m => m.seq)).toEqual([1, 2, 3]);
    fixture.destroy();
  });

  it('un mensaje que llega por polling y por la respuesta del envío aparece una sola vez', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.draft.set('Uno');
    component.send();
    const stored = message(3, { mine: true, body: 'Uno' });
    (component as unknown as { merge(items: ChatMessage[]): void }).merge([stored]);
    sends[0].next(stored);
    expect(component.messages().filter(m => m.seq === 3)).toHaveLength(1);
    fixture.destroy();
  });

  it('conversación bloqueada: no hay reintento y se oculta el editor', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.draft.set('Hola');
    component.send();
    api['get'].mockReturnValue(of(conversation({ blockedByOther: true })));
    sends[0].error(new HttpErrorResponse({ status: 409, error: { code: 'conversation_blocked' } }));
    expect(component.pending()[0]).toMatchObject({ status: 'failed', final: true });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('textarea#chatDraft')).toBeNull();
    expect(el.textContent).not.toContain('Reintentar');
    fixture.destroy();
  });

  it('el límite (429) explica cuándo reintentar y permite reintentar', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.draft.set('Hola');
    component.send();
    sends[0].error(new HttpErrorResponse({ status: 429, error: { code: 'rate_limited', params: { retryAt: '2026-10-22T14:00:00.000Z' } } }));
    expect(component.pending()[0].final).toBe(false);
    expect(component.failureText(component.pending()[0])).toContain('Puedes volver a intentar a las');
    expect(component.failureText(component.pending()[0])).toContain('11:00'); // 14:00Z en Córdoba (UTC−3)
    fixture.destroy();
  });

  it('no permite enviar vacío ni más de 2000 caracteres', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.draft.set('   ');
    expect(component.canSend()).toBe(false);
    component.draft.set('a'.repeat(2001));
    expect(component.canSend()).toBe(false);
    component.draft.set('a'.repeat(2000));
    expect(component.canSend()).toBe(true);
    fixture.destroy();
  });

  it('muestra las fechas en la zona del usuario y textos en inglés si elige EN, sin traducir mensajes', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const fixture = await create([message(1, { body: 'Hola, ¿qué tal?', createdAt: '2026-10-22T13:05:00.000Z' })]);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Hola, ¿qué tal?');
    expect(text).toContain('10:05'); // Córdoba, UTC−3
    expect(text).toContain('Back to messages');
    fixture.destroy();
  });

  it('una conversación ajena o inexistente muestra «no encontrada»', async () => {
    sends = [];
    api = { get: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404, error: { code: 'not_found' } }))), messages: vi.fn(), markRead: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ChatConversationComponent],
      providers: [
        provideRouter([]),
        ...i18nProviders,
        { provide: ChatService, useValue: api },
        { provide: ChatBadgeService, useValue: { refresh: vi.fn() } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: '9' })) } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(ChatConversationComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No encontramos esta conversación');
    expect(api['messages']).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
