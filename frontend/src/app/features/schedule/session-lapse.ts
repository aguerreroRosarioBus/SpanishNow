import { ClassSession } from '../../core/services/class-sessions.service';

/**
 * Una clase sin confirmar ya no puede aceptarse cuando su plazo de respuesta pasó o la clase misma terminó.
 * Se deriva de las fechas para no depender de que el worker de la cola haya marcado la propuesta como vencida (D-04).
 */
export function isLapsed(session: Pick<ClassSession, 'status' | 'endsAt' | 'proposal'>, now: number = Date.now()): boolean {
  if (!['draft', 'forming', 'proposed'].includes(session.status)) return false;
  const proposal = session.proposal;
  const deadlinePassed = proposal?.status === 'pending' && proposal.kind === 'initial' && Date.parse(proposal.expiresAt) <= now;
  return deadlinePassed || Date.parse(session.endsAt) <= now;
}
