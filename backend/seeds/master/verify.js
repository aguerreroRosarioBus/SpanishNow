// Auditoría de las filas persistidas, aislada de los datos previos de la base.
const { Temporal } = require('@js-temporal/polyfill');
function validateGraph(g) {
  const errors = [];
  const rows = name => g[name] || [];
  const map = name => new Map(rows(name).map(r => [String(r.id), r]));
  const users = map('User'), courses = map('Course'), units = map('Unit'), stories = map('Story'), plans = map('LessonPlan');
  const enrollments = map('Enrollment'), orders = map('Order'), questions = map('Question'), progress = map('LessonProgress');
  const quiz = map('UnitQuiz'), packages = map('ClassPackagePurchase'), offers = map('ClassOffer'), packageOrders = map('ClassPackageOrder');
  const versions = map('ClassPackageTemplateVersion'), sessions = map('ClassSession'), conv = map('Conversation');
  const blocks = new Map(rows('LessonBlock').map(b => [`${b.planId}:${b.blockKey}`, b]));
  const check = (ok, message) => { if (!ok) errors.push(message); };
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const courseOfStory = s => units.get(String(s?.unitId))?.courseId;
  for (const u of rows('Unit')) check(courses.has(String(u.courseId)), `Unidad ${u.id}: curso inexistente`);
  for (const s of rows('Story')) {
    const published = rows('LessonPlan').filter(p => p.storyId === s.id && p.status === 'published');
    check(published.length === (courses.get(String(courseOfStory(s)))?.isPublished ? 1 : 0), `Historia ${s.id}: revisiones publicadas`);
    const p = rows('LessonPlan').find(p => p.storyId === s.id);
    const kf = rows('LessonBlock').filter(b => b.planId === p?.id && b.type === 'keyframe').sort((a,b)=>a.position-b.position);
    check(kf.map(b=>b.text).join('\n\n') === s.text, `Historia ${s.id}: texto distinto del plan`);
    check(rows('LessonBlock').filter(b=>b.planId===p?.id && b.type==='full_story').length===1, `Historia ${s.id}: lectura completa`);
  }
  for (const b of rows('LessonBlock')) {
    const p = plans.get(String(b.planId));
    check(Boolean(p), `Bloque ${b.id}: plan inexistente`);
    if (b.type === 'question') {
      const q = questions.get(String(b.questionId));
      check(q?.storyId === p?.storyId && b.questionSnapshot?.correctAnswer === q?.correctAnswer, `Bloque ${b.id}: pregunta o snapshot`);
      check(blocks.get(`${b.planId}:${b.contextBlockKey}`)?.type === 'keyframe', `Bloque ${b.id}: contexto inexistente`);
      check(q?.options.includes(q.correctAnswer), `Pregunta ${q?.id}: respuesta fuera de opciones`);
    }
  }
  const words=new Set();
  for (const v of rows('Vocabulary')) { const key=`${v.unitId}:${v.word.toLowerCase()}`; check(!words.has(key), `Vocabulario ${v.id}: duplicado en unidad`); words.add(key); }
  for (const e of rows('Enrollment')) {
    const c = courses.get(String(e.courseId));
    check(users.get(String(e.studentId))?.role === 'student' && Boolean(c), `Inscripción ${e.id}: participantes`);
    check(+new Date(e.createdAt) >= +new Date(c?.createdAt) && +new Date(e.createdAt) >= +new Date(users.get(String(e.studentId))?.createdAt), `Inscripción ${e.id}: cronología`);
    if (e.source === 'purchase') {
      const o = orders.get(String(e.orderId));
      check(o?.status === 'paid' && o.userId === e.studentId && o.courseId === e.courseId && +new Date(o.paidAt) <= +new Date(e.createdAt), `Inscripción ${e.id}: pago`);
    }
  }
  for (const o of rows('Order')) {
    check(o.amount === o.originalAmount - o.discountAmount && o.refundedAmount >= 0 && o.refundedAmount <= o.amount, `Orden ${o.id}: importes`);
    check(o.provider === 'fake' && !o.receiptUrl, `Orden ${o.id}: proveedor`);
    check(o.commissionAmount === (o.affiliateId ? Math.floor((o.amount-o.refundedAmount)*(o.commissionPercent||0)/100) : 0), `Orden ${o.id}: comisión`);
    if (o.status === 'refunded') check(o.refundedAmount === o.amount, `Orden ${o.id}: reembolso`);
  }
  for (const coupon of rows('Coupon')) check(coupon.redemptions === rows('Order').filter(o=>o.couponId===coupon.id && ['paid','refunded'].includes(o.status)).length, `Cupón ${coupon.id}: usos`);
  for (const payout of rows('AffiliatePayout')) check(payout.amount <= rows('Order').filter(o=>o.affiliateId===payout.affiliateId).reduce((s,o)=>s+o.commissionAmount,0), `Liquidación ${payout.id}: saldo`);
  for (const p of rows('LessonProgress')) {
    const e = enrollments.get(String(p.enrollmentId)); const plan = plans.get(String(p.planId));
    check(plan?.status === 'published' && plan.storyId===p.storyId && courseOfStory(stories.get(String(p.storyId)))===e?.courseId, `Progreso ${p.id}: plan o curso`);
    check(blocks.has(`${p.planId}:${p.lastBlockKey}`), `Progreso ${p.id}: cursor`);
    check(+new Date(p.createdAt) >= +new Date(e?.createdAt), `Progreso ${p.id}: anterior a inscripción`);
    if (p.narrativeCompleted) for (const b of rows('LessonBlock').filter(b=>b.planId===p.planId&&b.type==='question'&&b.phase==='during')) {
      check(rows('LessonAnswer').some(a=>a.lessonProgressId===p.id&&a.blockKey===b.blockKey&&a.isCorrect), `Progreso ${p.id}: falta respuesta durante la historia`);
    }
  }
  for (const a of rows('LessonAnswer')) {
    const p = progress.get(String(a.lessonProgressId)); const b = blocks.get(`${p?.planId}:${a.blockKey}`); const q = questions.get(String(a.questionId));
    check(b?.questionId === a.questionId && Boolean(a.isCorrect) === (q?.correctAnswer === a.studentAnswer), `Respuesta ${a.id}: bloque o corrección`);
  }
  for (const r of rows('LessonReinforcement')) {
    const p = progress.get(String(r.lessonProgressId));
    check(['flashcards','matching','listen_repeat'].includes(blocks.get(`${p?.planId}:${r.blockKey}`)?.type), `Refuerzo ${r.id}: bloque`);
  }
  for (const a of rows('UnitQuizAttempt')) {
    const q = quiz.get(String(a.quizId)); const e = enrollments.get(String(a.enrollmentId));
    const qs = rows('UnitQuizQuestion').filter(x=>x.quizId===a.quizId).sort((x,y)=>x.order-y.order);
    const score = Math.round(100*qs.filter((q,i)=>q.correctIndex===a.answers[i]).length/qs.length);
    check(units.get(String(q?.unitId))?.courseId===e?.courseId && score===a.score && Boolean(a.passed) === (score>=q?.passingScore), `Intento ${a.id}: curso o puntaje`);
  }
  for (const cert of rows('Certificate')) {
    const e = enrollments.get(String(cert.enrollmentId));
    const required = rows('Story').filter(s=>courseOfStory(s)===e?.courseId);
    check(required.length>0 && required.every(s=>rows('LessonProgress').some(p=>p.enrollmentId===e.id&&p.storyId===s.id&&p.narrativeCompleted)), `Certificado ${cert.id}: historias pendientes`);
    check(rows('UnitQuiz').filter(q=>q.isPublished&&units.get(String(q.unitId))?.courseId===e?.courseId).every(q=>rows('UnitQuizAttempt').some(a=>a.enrollmentId===e.id&&a.quizId===q.id&&a.passed)), `Certificado ${cert.id}: quiz pendiente`);
    const completionDates = [...rows('LessonProgress').filter(p=>p.enrollmentId===e?.id), ...rows('UnitQuizAttempt').filter(a=>a.enrollmentId===e?.id)];
    check(completionDates.every(r=>+new Date(r.createdAt)<=+new Date(cert.issuedAt)), `Certificado ${cert.id}: emitido antes de completar`);
  }
  for (const c of rows('Conversation')) {
    const messages = rows('Message').filter(m=>m.conversationId===c.id).sort((a,b)=>a.seq-b.seq);
    check(messages.length === c.lastMessageSeq && messages.every((m,i)=>m.seq===i+1), `Chat ${c.id}: secuencia`);
    check(+new Date(messages.at(-1)?.createdAt)===+new Date(c.lastMessageAt), `Chat ${c.id}: última fecha`);
    check(rows('ConversationParticipant').filter(p=>p.conversationId===c.id).length===2, `Chat ${c.id}: participantes`);
    check(messages.every((m,i)=>!i||+new Date(m.createdAt)>=+new Date(messages[i-1].createdAt)), `Chat ${c.id}: orden temporal`);
  }
  for (const p of rows('ConversationParticipant')) check(p.lastReadSeq<=conv.get(String(p.conversationId))?.lastMessageSeq, `Chat ${p.conversationId}: lectura`);
  for (const o of rows('ClassOffer')) {
    const v = versions.get(String(o.templateVersionId));
    check(o.amount===v?.priceAmount && o.currency===v?.currency && o.snapshot.priceAmount===o.amount && o.snapshot.teacherId===o.teacherId && o.snapshot.buyerId===o.buyerId, `Oferta ${o.id}: snapshot`);
    check(same(o.snapshot.beneficiaryIds.slice().sort(),rows('ClassOfferBeneficiary').filter(b=>b.offerId===o.id).map(b=>b.userId).sort()), `Oferta ${o.id}: beneficiarios`);
  }
  for (const order of rows('ClassPackageOrder')) {
    const offer=offers.get(String(order.offerId));
    check(order.provider==='fake' && order.amount===offer?.amount && order.currency===offer?.currency && order.buyerId===offer?.buyerId, `Orden de clases ${order.id}: oferta/importes`);
    check(order.refundedAmount>=0 && order.refundedAmount<=order.amount, `Orden de clases ${order.id}: devolución`);
    if (order.status==='paid_needs_review') check(!rows('ClassPackagePurchase').some(p=>p.orderId===order.id), `Orden de clases ${order.id}: revisión acreditada`);
  }
  for (const p of rows('ClassPackagePurchase')) {
    const o=offers.get(String(p.offerId)), order=packageOrders.get(String(p.orderId));
    check(order?.provider==='fake' && order.offerId===p.offerId && order.amount===o?.amount && order.currency===o?.currency && p.buyerId===o?.buyerId && same(p.snapshot,o?.snapshot), `Compra ${p.id}: orden u oferta`);
    const b={available:0,reserved:0,consumed:0,expired:0,refunded:0}; let granted=0;
    const entries=rows('ClassCreditLedger').filter(e=>e.purchaseId===p.id).sort((a,b)=>Number(a.id)-Number(b.id));
    for(const e of entries) {
      if(e.fromBucket==='none') granted+=e.units; else b[e.fromBucket]-=e.units;
      if(e.toBucket==='none') granted-=e.units; else b[e.toBucket]+=e.units;
      check(Object.values(b).every(n=>n>=0), `Compra ${p.id}: saldo negativo durante ledger`);
      if(e.classSessionId) check(sessions.has(String(e.classSessionId)), `Ledger ${e.id}: sesión`);
    }
    check(granted===p.unitsGranted && granted===Object.values(b).reduce((x,y)=>x+y,0) && Object.entries(b).every(([k,n])=>p[`units${k[0].toUpperCase()}${k.slice(1)}`]===n), `Compra ${p.id}: ledger y saldo`);
    const funded=rows('ClassSessionParticipant').filter(s=>s.purchaseId===p.id);
    const reservedIds=new Set(funded.filter(s=>sessions.get(String(s.sessionId))?.status==='confirmed').map(s=>s.sessionId));
    const consumedIds=new Set(funded.filter(s=>['completed','student_no_show'].includes(sessions.get(String(s.sessionId))?.status)).map(s=>s.sessionId));
    check(reservedIds.size===p.unitsReserved && consumedIds.size===p.unitsConsumed, `Compra ${p.id}: reservas/consumos por sesión`);
    check(rows('ClassPackageBeneficiary').filter(b=>b.purchaseId===p.id).length===p.seatsCovered, `Compra ${p.id}: plazas`);
  }
  for(const s of rows('ClassSession')) {
    check(+new Date(s.endsAt)-+new Date(s.startsAt)===s.minutes*60000, `Sesión ${s.id}: duración`);
    const z=Temporal.Instant.from(new Date(s.startsAt).toISOString()).toZonedDateTimeISO(s.timeZone);
    check(z.toPlainDateTime().toString().slice(0,16)===s.localStart && z.offset===s.utcOffset, `Sesión ${s.id}: instante/zona`);
    const parts=rows('ClassSessionParticipant').filter(p=>p.sessionId===s.id);
    check(parts.length === (s.kind==='group' ? rows('ClassCohort').find(c=>c.id===s.cohortId)?.groupSize : 1), `Sesión ${s.id}: plazas`);
    for(const p of parts) {
      const purchase=packages.get(String(p.purchaseId));
      check(purchase?.teacherId===s.teacherId && purchase.minutesPerSession===s.minutes && rows('ClassPackageBeneficiary').some(b=>b.purchaseId===p.purchaseId&&b.userId===p.userId), `Sesión ${s.id}: titularidad`);
      check(+new Date(s.startsAt)<+new Date(purchase?.expiresAt) && +new Date(s.createdAt)>=+new Date(purchase?.paidAt), `Sesión ${s.id}: vigencia`);
      if(['completed','student_no_show'].includes(s.status)) check(p.attendance===(s.status==='completed'?'attended':'student_no_show'), `Sesión ${s.id}: asistencia`);
    }
    if(s.status==='confirmed') check(parts.every(p=>p.status==='confirmed'&&p.acceptedVersion===s.version), `Sesión ${s.id}: aceptaciones`);
  }
  const occupying=rows('ClassSession').filter(s=>['confirmed','completed','student_no_show'].includes(s.status));
  for(let i=0;i<occupying.length;i++) for(let j=i+1;j<occupying.length;j++) {
    const a=occupying[i],b=occupying[j];
    const shared=a.teacherId===b.teacherId || rows('ClassSessionParticipant').some(p=>p.sessionId===a.id&&rows('ClassSessionParticipant').some(q=>q.sessionId===b.id&&q.userId===p.userId));
    if(shared) check(+new Date(a.startsAt)>=+new Date(b.endsAt)+600000 || +new Date(b.startsAt)>=+new Date(a.endsAt)+600000, `Sesiones ${a.id}/${b.id}: solapamiento`);
  }
  for(const t of rows('Tooltip')) {
    const b=rows('LessonBlock').find(b=>b.blockKey===t.blockKey);
    check(b?.text.slice(t.startOffset,t.endOffset)===t.selectedText, `Tooltip ${t.id}: offsets`);
  }
  const parents=map('LessonComment');
  for(const c of rows('LessonComment')) if(c.parentId) check(parents.get(String(c.parentId))?.storyId===c.storyId, `Comentario ${c.id}: historia`);
  return errors;
}
module.exports={validateGraph};
