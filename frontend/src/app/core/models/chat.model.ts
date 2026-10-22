// Chat privado docente–alumno (docs/clases-chat-integraciones/CONTRATO.md §9.2).

export type ChatRole = 'teacher' | 'student';
export type MessageType = 'text' | 'offer' | 'session_proposal' | 'system_event';

export interface ChatContext {
  type: 'course' | 'package' | 'session';
  id: number;
  title: { es: string; en: string } | null;
}

export interface LastMessagePreview {
  seq: number;
  type: MessageType;
  senderIsMe: boolean;
  /** Primeros caracteres de un texto; null para tarjetas, eventos u ocultos. */
  preview: string | null;
  eventCode: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface Conversation {
  id: number;
  role: ChatRole;
  counterpart: { id: number; name: string; role: ChatRole };
  context: ChatContext | null;
  lastMessage: LastMessagePreview | null;
  lastMessageSeq: number;
  lastMessageAt: string | null;
  lastReadSeq: number;
  unreadCount: number | null;
  teacherReplied: boolean;
  blockedByMe: boolean;
  blockedByOther: boolean;
  reportedByMe: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  seq: number;
  type: MessageType;
  senderId: number | null;
  senderRole: ChatRole | 'system' | null;
  mine: boolean;
  /** Texto plano escrito por una persona: se muestra con interpolación, nunca como HTML. */
  body: string | null;
  hidden: boolean;
  clientMessageId: string | null;
  context: ChatContext | null;
  offerId: number | null;
  classSessionId: number | null;
  proposalVersion: number | null;
  eventCode: string | null;
  eventParams: Record<string, unknown> | null;
  createdAt: string;
}

export interface ConversationPage { items: Conversation[]; nextCursor: string | null }
export interface MessagePage { items: ChatMessage[]; hasMore: boolean }
export interface UnreadSummary { conversations: number; messages: number }
export interface AvailableTeacher { id: number; name: string }

/** Mensaje propio que todavía no confirmó el servidor (CHAT-06: enviando / falló). */
export interface PendingMessage {
  clientMessageId: string;
  body: string;
  status: 'sending' | 'failed';
  /**
   * Error tal como llegó (code/params/status), no el texto: el aviso se traduce al mostrarlo, con el idioma y la zona
   * vigentes (AC17).
   */
  error: unknown;
  /** El reintento no tiene sentido (p. ej. conversación bloqueada o texto inválido). */
  final: boolean;
}

export const CHAT_MAX_LENGTH = 2000;
