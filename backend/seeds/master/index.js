const { randomBytes, randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { PEOPLE, COURSES, lesson, EXPECTATIONS } = require('./content');
const initialCatalog = require('../../src/domain/classInitialCatalog');
const { DEFAULT_POLICY_V1 } = require('../../src/domain/classPolicy');
const { FIELDS } = require('../../src/services/classCatalog');
const { restoreBoard } = require('../../src/services/liveBoard');
const credits = require('../../src/services/classCredits');
const { generateCode } = require('../../src/services/certificateService');
const { validateGraph } = require('./verify');
const KEY = 'seed.master.v1';
const DAY = 86400000;
const date = value => new Date(value);
const later = (...values) => new Date(Math.max(...values.map(v => +new Date(v))));

async function loadGraph(models, manifest, transaction) {
  const graph = {};
  for (const [name, ids] of Object.entries(manifest.rows)) {
    const pk = models[name].primaryKeyAttribute;
    graph[name] = await models[name].findAll({ where: { [pk]: { [Op.in]: ids } }, raw: true, transaction });
    if (graph[name].length !== ids.length) throw new Error(`Seed incompleto: faltan filas de ${name}; restaurar el respaldo o revisar manualmente, sin recrear IDs.`);
  }
  for (const id of manifest.referenceConversations || []) {
    for (const [name, where] of [['Conversation', { id }], ['Message', { conversationId: id }], ['ConversationParticipant', { conversationId: id }]]) {
      const extra = await models[name].findAll({ where, raw: true, transaction });
      const byId = new Map([...(graph[name] || []), ...extra].map(r => [String(r.id), r])); graph[name] = [...byId.values()];
    }
  }
  const userIds = [...new Set([...manifest.teacherIds, ...manifest.studentIds])];
  graph.User = await models.User.findAll({ where: { id: userIds }, raw: true, transaction });
  return graph;
}
async function verify(models, manifest, transaction) {
  const graph = await loadGraph(models, manifest, transaction);
  const errors = validateGraph(graph);
  if (errors.length) throw new Error(`Inconsistencias del seed:\n${errors.slice(0, 40).join('\n')}${errors.length > 40 ? `\n… ${errors.length} errores en total` : ''}`);
  return Object.fromEntries(Object.entries(manifest.rows).map(([name, ids]) => [name, ids.length]));
}

// Un solo dataset por base. La auditoría registra únicamente IDs y fecha de referencia, nunca contraseñas.
async function run({ models: M, sequelize, options, assets, log = () => {} }) {
  const connection = await sequelize.connectionManager.getConnection();
  const queryLock = sql => new Promise((resolve, reject) => connection.query(sql, (err, rows) => err ? reject(err) : resolve(rows)));
  let locked = false;
  try {
    const rows = await queryLock("SELECT GET_LOCK('spanishnow.seed.master.v1', 0) AS acquired");
    if (Number(rows[0].acquired) !== 1) throw new Error('Ya hay otro seed maestro ejecutándose.');
    locked = true;
    return await sequelize.transaction(async transaction => {
      const previous = await M.AuditLog.findOne({ where: { action: KEY }, transaction });
      if (previous) {
        const manifest = previous.data;
        if (JSON.stringify([...options.teacherEmails].sort()) !== JSON.stringify([...manifest.teacherEmails].sort()) ||
            JSON.stringify([...options.studentEmails].sort()) !== JSON.stringify([...manifest.extraStudentEmails].sort())) {
          throw new Error('La base ya tiene otro alcance del seed maestro. Reutilizá los mismos docentes/alumnos; no se mezcla ni se sobrescribe.');
        }
        const counts = await verify(M, manifest, transaction);
        return { replayed: true, manifest, counts };
      }
      const anchor = new Date(options.now || Date.now()); anchor.setUTCMilliseconds(0);
      const start = new Date(+anchor - 180 * DAY);
      const teachers = [];
      for (const email of options.teacherEmails) {
        const user = await M.User.findOne({ where: { email, role: 'teacher', suspendedAt: null }, transaction, lock: transaction.LOCK.UPDATE });
        if (!user) throw new Error(`Docente no disponible: ${email}`);
        teachers.push(user);
      }
      const manifest = { version: 1, anchor: anchor.toISOString(), teacherEmails: options.teacherEmails, extraStudentEmails: options.studentEmails,
        teacherIds: teachers.map(u => u.id), studentIds: [], rows: {}, referenceConversations: [], assets: assets.files };
      const add = async (name, values, at = start) => {
        const row = await M[name].create({ ...values, createdAt: at, ...(M[name].rawAttributes.updatedAt ? { updatedAt: at } : {}) }, { transaction });
        (manifest.rows[name] ||= []).push(row[M[name].primaryKeyAttribute]);
        return row;
      };
      const many = async (name, values, at) => {
        if (!values.length) return [];
        const rows = await M[name].bulkCreate(values.map(v => ({ createdAt: at, ...(M[name].rawAttributes.updatedAt ? { updatedAt: at } : {}), ...v })), { transaction, validate: true });
        (manifest.rows[name] ||= []).push(...rows.map(r => r[M[name].primaryKeyAttribute]));
        return rows;
      };
      const students = [];
      for (const [i, name] of PEOPLE.entries()) {
        const email = `master.${name.toLowerCase().replaceAll(' ', '.')}@example.test`;
        if (await M.User.findOne({ where: { email }, transaction })) throw new Error(`Identidad ocupada fuera de este seed: ${email}`);
        students.push(await add('User', { name, email, password: options.password, role: 'student', isTestAccount: true,
          locale: i % 4 === 0 ? 'es' : 'en', timeZone: ['America/New_York', 'Europe/London', 'America/Argentina/Cordoba', 'Europe/Madrid'][i % 4], timeZoneConfirmedAt: start, chatUnreadEmail: false }, start));
      }
      for (const email of options.studentEmails) {
        const user = await M.User.findOne({ where: { email, role: 'student', suspendedAt: null }, transaction });
        if (!user) throw new Error(`Alumno no disponible: ${email}`);
        students.push(user);
      }
      manifest.studentIds = students.map(u => u.id);
      const latestPolicy = await M.ClassPolicyVersion.findOne({ order: [['version', 'DESC']], transaction });
      const policy = await add('ClassPolicyVersion', { version: (latestPolicy?.version || 0) + 1,
        rules: { ...(latestPolicy?.rules || DEFAULT_POLICY_V1), refundWindowHours: Math.max(360, latestPolicy?.rules.refundWindowHours || 0), refundMode: 'full_unused_then_review' },
        createdById: teachers[0].id }, later(start, teachers[0].createdAt));
      manifest.policyId = policy.id;
      for (const [teacherIndex, teacher] of teachers.entries()) {
        const teacherStart = later(start, teacher.createdAt);
        const historyDay = fraction => new Date(+teacherStart + (+anchor - +teacherStart) * fraction);
        const courses = [];
        log(`Contenido y actividad para ${teacher.name}`);
        const coupons = [];
        for (const [i, percent] of [20, 35, 50].entries()) coupons.push(await add('Coupon', { teacherId: teacher.id, code: `MASTER-${teacher.id}-${['BIENVENIDA','LECTORES','ARCHIVO'][i]}`,
          percentOff: percent, maxRedemptions: 200, redemptions: 0, active: i !== 2, expiresAt: new Date(+anchor + (i === 2 ? -7 : 60) * DAY) }, historyDay(0.02)));
        const affiliates = [];
        for (const [i, name] of ['Aula Abierta', 'Café de Idiomas', 'Puentes Culturales'].entries()) affiliates.push(await add('Affiliate', { teacherId: teacher.id, name,
          email: `master.affiliate.${teacher.id}.${i}@example.test`, code: `MASTER-${teacher.id}-SOCIO${i + 1}`, commissionPercent: [15,20,10][i],
          dashboardToken: randomBytes(32).toString('base64url'), active: i !== 2, notes: 'Colaboración ficticia del seed maestro local.' }, historyDay(0.02)));
        for (const [ci, spec] of COURSES.entries()) {
          const courseAt = historyDay(0.03 + ci * 0.01);
          const course = await add('Course', { teacherId: teacher.id, title: spec.title, slug: `master-${teacher.id}-${spec.key}`, description: `Aprende español con ${spec.person} en ${spec.place}. ${EXPECTATIONS.es.contents}`,
            level: spec.level, price: spec.price, currency: 'usd', isPublished: !spec.draft, imageUrl: assets.url(`${spec.key}.svg`), salesDescription: `${EXPECTATIONS.en.objective}\n\n${EXPECTATIONS.en.selfStudy}` }, courseAt);
          await add('CourseExpectations', { courseId: course.id, version: 1, expectations: EXPECTATIONS, updatedById: teacher.id }, courseAt);
          const data = { course, spec, units: [], stories: [] }; courses.push(data);
          for (const [ui, title] of spec.units.entries()) {
            const unit = await add('Unit', { courseId: course.id, title, description: `Historias para ${title.toLowerCase()}, con lectura, escucha y práctica contextual.`, order: (ui + 1) * 100 }, courseAt);
            const u = { unit, stories: [] }; data.units.push(u);
            const quiz = await add('UnitQuiz', { unitId: unit.id, title: `Repaso: ${title}`, passingScore: 70, isPublished: !spec.draft }, courseAt); u.quiz = quiz;
            const unitVocabulary = new Map();
            for (let si = 0; si < 3; si++) {
              const index = ui * 3 + si; const content = lesson(spec, index);
              const mediaKey = `${spec.key}-${index}`;
              const audio = suffix => assets.files.includes(`${mediaKey}-${suffix}.wav`) ? assets.url(`${mediaKey}-${suffix}.wav`) : null;
              const story = await add('Story', { unitId: unit.id, title: content.title, text: content.frames.join('\n\n'), order: (si + 1) * 100,
                audioSlowUrl: audio('slow'), audioNormalUrl: audio('normal') }, courseAt);
              const vocabulary = [];
              for (const [word, translation, example, partOfSpeech] of content.words) {
                if (!unitVocabulary.has(word)) unitVocabulary.set(word, await add('Vocabulary', { unitId: unit.id, word, translation, example, partOfSpeech, imageUrl: assets.url(`${spec.key}.svg`) }, courseAt));
                vocabulary.push(unitVocabulary.get(word));
              }
              const questions = await many('Question', content.questions.map(q => ({ storyId: story.id, questionText: q.text, answerType: 'choice', options: [q.correct, q.wrong], correctAnswer: q.correct })), courseAt);
              const plan = await add('LessonPlan', { storyId: story.id, revision: 1, status: spec.draft ? 'draft' : 'published', audioSlowUrl: audio('slow'), audioNormalUrl: audio('normal') }, courseAt);
              const blocks = vocabulary.slice(0,2).map(v => ({ planId: plan.id, blockKey: randomUUID(), type: 'expression', phase: 'before', vocabularyId: v.id, vocabularyRole: 'target', vocabularySnapshot: { word: v.word, translation: v.translation, example: v.example, partOfSpeech: v.partOfSpeech, audioUrl: null, imageUrl: v.imageUrl } }));
              for (const [fi, text] of content.frames.entries()) {
                const blockKey = randomUUID(); blocks.push({ planId: plan.id, blockKey, type: 'keyframe', phase: 'during', text, required: true, imageUrl: assets.url(`${spec.key}.svg`), imageAlt: `Ilustración de ${spec.title}` });
                const q = questions[fi];
                blocks.push({ planId: plan.id, blockKey: randomUUID(), type: 'question', phase: 'during', questionId: q.id, contextBlockKey: blockKey,
                  questionSnapshot: { questionText: q.questionText, answerType: q.answerType, options: q.options, correctAnswer: q.correctAnswer, audioUrl: null } });
              }
              blocks.push(...['full_story','flashcards','matching','listen_repeat'].map(type => ({ planId: plan.id, blockKey: randomUUID(), type, phase: 'after' })));
              const saved = await many('LessonBlock', blocks.map((b, position) => ({ ...b, position })), courseAt);
              const item = { story, plan, blocks: saved, questions, vocabulary, content }; data.stories.push(item); u.stories.push(item);
              const kf = saved.find(b => b.type === 'keyframe');
              const selectedText = spec.person;
              await add('Tooltip', { targetType: 'keyframe', targetId: story.id, blockKey: kf.blockKey, startOffset: 0, endOffset: selectedText.length, selectedText,
                tooltipContent: `${spec.person} es el personaje principal de esta historia.`, createdBy: teacher.id, isActive: true }, courseAt);
              await add('UnitQuizQuestion', { quizId: quiz.id, order: si, prompt: `En «${content.title}»: ${content.questions[1].text}`, options: questions[1].options,
                correctIndex: 0, explanation: content.frames[1] }, courseAt);
            }
            await add('Material', { courseId: course.id, unitId: unit.id, title: `Cuaderno de práctica: ${title}`, fileUrl: assets.url(`${spec.key}-${ui}.pdf`), sizeBytes: assets.sizes[`${spec.key}-${ui}.pdf`], order: ui }, courseAt);
          }
        }
        // Reapariciones explícitas, con el mismo vocabulario del origen y una historia posterior.
        for (const data of courses) for (let i = 0; i < data.stories.length - 1; i++) {
          const from = data.stories[i], to = data.stories[i + 1], v = from.vocabulary[0];
          const shared = { type: 'expression', vocabularyId: v.id, vocabularyRole: 'revisit', vocabularySnapshot: { word: v.word, translation: v.translation, example: v.example } };
          const revisit = await add('LessonBlock', { ...shared, planId: from.plan.id, blockKey: randomUUID(), phase: 'later', position: from.blocks.length, revisitStoryId: to.story.id }, from.story.createdAt);
          from.blocks.push(revisit);
          const before = await add('LessonBlock', { ...shared, planId: to.plan.id, blockKey: randomUUID(), phase: 'before', position: -1 }, to.story.createdAt);
          to.blocks.unshift(before);
        }
        for (let i = 0; i < courses.length - 2; i++) await courses[i].course.update({ nextCourseId: courses[i + 1].course.id, nextCourseCouponId: coupons[0].id, updatedAt: historyDay(0.1) }, { transaction, silent: true });
        for (const [si, student] of students.entries()) {
          for (const [ci, data] of courses.filter(c => !c.spec.draft).entries()) {
            // Cohortes de distinta antigüedad y avances, sin matricular a todos en todo.
            if (si < PEOPLE.length && ci > 0 && (si + ci) % 4 === 0) continue;
            const { course, units, stories } = data;
            const enrolledAt = later(historyDay(0.18 + (si % 8) * 0.06), student.createdAt, course.createdAt);
            const activityAt = fraction => new Date(+enrolledAt + (+anchor - +enrolledAt) * fraction);
            let order = null;
            if (course.price) {
              const coupon = (si + ci) % 3 === 0 ? coupons[0] : null;
              const affiliate = (si + ci) % 2 === 0 ? affiliates[(si + ci) % 2] : null;
              const discountAmount = coupon ? Math.floor(course.price * coupon.percentOff / 100) : 0;
              const amount = course.price - discountAmount;
              order = await add('Order', { courseId: course.id, userId: student.id, email: student.email, amount, originalAmount: course.price, discountAmount, currency: course.currency,
                status: 'paid', provider: 'fake', providerSessionId: `master:${teacher.id}:${student.id}:${course.id}`, providerPaymentId: `master-paid-${teacher.id}-${student.id}-${ci}`, paidAt: enrolledAt,
                couponId: coupon?.id, affiliateId: affiliate?.id, commissionPercent: affiliate?.commissionPercent, commissionAmount: affiliate ? Math.floor(amount * affiliate.commissionPercent / 100) : 0, commissionStatus: affiliate ? 'pending' : 'none' }, enrolledAt);
              if (coupon) { coupon.redemptions++; await coupon.save({ transaction, silent: true }); }
              await add('CourseCheckoutSnapshot', { courseId: course.id, userId: student.id, orderId: order.id, locale: student.locale || 'en', acceptedAt: enrolledAt,
                snapshot: { courseId: course.id, title: course.title, teacherId: teacher.id, price: course.price, currency: course.currency, version: 1, expectations: EXPECTATIONS, legalDocuments: [] } }, enrolledAt);
            }
            const enrollment = await add('Enrollment', { studentId: student.id, courseId: course.id, source: order ? 'purchase' : 'free', orderId: order?.id }, enrolledAt);
            const finished = si % 6 === 0;
            const done = finished ? stories.length : 1 + (si * 2 + ci) % 8;
            for (let j = 0; j < Math.min(done + (finished ? 0 : 1), stories.length); j++) {
              const s = stories[j]; const complete = j < done; const when = activityAt(0.12 + j * 0.075);
              const questionBlocks = s.blocks.filter(b => b.type === 'question');
              const progress = await add('LessonProgress', { enrollmentId: enrollment.id, storyId: s.story.id, planId: s.plan.id,
                narrativeCompleted: complete, lastBlockKey: complete ? s.blocks.find(b => b.type === 'full_story').blockKey : questionBlocks[0].blockKey }, when);
              if (complete) {
                const answers = questionBlocks.flatMap((b, qi) => {
                  const q = s.questions[qi]; const wrong = (si + j + qi) % 5 === 0;
                  return [...(wrong ? [{ lessonProgressId: progress.id, blockKey: b.blockKey, questionId: q.id, studentAnswer: q.options[1], isCorrect: false, attempt: 1 }] : []),
                    { lessonProgressId: progress.id, blockKey: b.blockKey, questionId: q.id, studentAnswer: q.correctAnswer, isCorrect: true, attempt: wrong ? 2 : 1 }];
                });
                await many('LessonAnswer', answers, when);
                await many('LessonReinforcement', s.blocks.filter(b => ['flashcards','matching','listen_repeat'].includes(b.type)).slice(0, si % 3 + 1).map(b => ({ lessonProgressId: progress.id, blockKey: b.blockKey, completed: true })), when);
              }
            }
            for (const [ui, u] of units.entries()) {
              if (done < (ui + 1) * 3) continue;
              const when = activityAt(0.34 + ui * 0.23);
              if ((si + ui) % 3 === 0) await add('UnitQuizAttempt', { quizId: u.quiz.id, enrollmentId: enrollment.id, answers: [1,0,1], score: 33, passed: false }, when);
              await add('UnitQuizAttempt', { quizId: u.quiz.id, enrollmentId: enrollment.id, answers: [0,0,0], score: 100, passed: true }, when);
            }
            if (finished) await add('Certificate', { enrollmentId: enrollment.id, code: generateCode(), studentName: student.name, courseTitle: course.title, teacherName: teacher.name, issuedAt: activityAt(0.95) }, activityAt(0.95));
            if ((si + ci) % 2 === 0) {
              const target = stories[Math.min(done - 1, stories.length - 1)]; const when = activityAt(0.9);
              const comments = [
                'Al volver a escuchar la historia pude reconocer las expresiones sin mirar la traducción. ¿Conviene repetirla una vez más antes de seguir?',
                'Me ayudó mucho leer primero en voz baja y después escuchar. Ya puedo contar la historia con mis propias palabras.',
                '¿Podemos usar esta expresión también en una conversación informal? La anoté para practicarla esta semana.',
                'Completé las tarjetas y hoy recordé la frase mientras hablaba con una amiga. ¡Qué buena sensación!'
              ];
              const comment = await add('LessonComment', { storyId: target.story.id, userId: student.id, body: comments[(si + ci) % comments.length] }, when);
              if (si % 4 !== 1) await add('LessonComment', { storyId: target.story.id, userId: teacher.id, parentId: comment.id,
                body: 'Muy buen trabajo. Volvé a la escena en la que aparece la expresión y contala con un ejemplo de tu vida. Si lo necesitás, usá primero la lectura y después el audio.' }, new Date(+when + Math.min(3600000, (+anchor - +when) / 2)));
            }
          }
        }
        // Órdenes sin acceso concedido: pendientes, fallidas y reembolsadas.
        for (const [oi, status] of ['pending','failed','refunded','paid'].entries()) {
          const student = students[oi]; const c = courses[1].course; const when = historyDay(0.85 + oi * 0.02);
          await add('Order', { courseId: c.id, userId: student.id, email: student.email, amount: c.price, originalAmount: c.price, currency: 'usd', status, provider: 'fake',
            providerSessionId: `master:extra:${teacher.id}:${oi}`, paidAt: ['paid','refunded'].includes(status) ? when : null,
            refundedAmount: status === 'refunded' ? c.price : status === 'paid' ? 1000 : 0, refundedAt: ['paid','refunded'].includes(status) ? new Date(+when + 1000) : null }, when);
        }
        for (const affiliate of affiliates) {
          const earned = await M.Order.sum('commissionAmount', { where: { affiliateId: affiliate.id }, transaction });
          if (earned) await add('AffiliatePayout', { affiliateId: affiliate.id, amount: Math.floor(earned / 2), currency: 'usd', paidAt: historyDay(0.99), note: 'Liquidación ficticia del período; ningún dinero transferido.' }, historyDay(0.99));
        }
        await seedClasses({ teacher, students, policy, historyDay, teacherIndex, courses, anchor, add, many, M, transaction, manifest });
      }
      if (options.failBeforeVerify) throw new Error('Fallo inyectado para verificar rollback');
      const counts = await verify(M, manifest, transaction);
      await M.AuditLog.create({ actorId: teachers[0].id, action: KEY, entityType: 'local_demo_seed', reason: 'Seed maestro ficticio, aditivo y validado.', data: manifest, createdAt: anchor }, { transaction });
      return { replayed: false, manifest, counts };
    });
  } finally {
    if (locked) await queryLock("SELECT RELEASE_LOCK('spanishnow.seed.master.v1')");
    await sequelize.connectionManager.releaseConnection(connection);
  }
}

async function seedClasses({ teacher, students, policy, historyDay, teacherIndex, courses, anchor, add, many, M, transaction, manifest }) {
  const versions = [];
  for (const [i, value] of initialCatalog.entries()) {
    const when = historyDay(0.05);
    const template = await add('ClassPackageTemplate', { teacherId: teacher.id, templateKey: `master-${value.templateKey}`, status: i === 5 ? 'paused' : 'draft' }, when);
    const version = await add('ClassPackageTemplateVersion', { ...value, templateId: template.id, version: 1, policyVersionId: policy.id, createdById: teacher.id, expectations: EXPECTATIONS,
      descriptionEs: `Práctica guiada: ${value.sessionsCount} encuentros de ${value.minutesPerSession} minutos.`, descriptionEn: `Guided practice: ${value.sessionsCount} sessions of ${value.minutesPerSession} minutes.` }, when);
    await template.update({ currentVersionId: version.id, updatedAt: when }, { transaction, silent: true }); versions.push(version);
  }
  const conversations = new Map();
  for (const [si, student] of students.entries()) {
    const when = later(historyDay(0.12), student.createdAt);
    // Solo se agregan mensajes en conversaciones nuevas; nunca se reescribe una conversación humana.
    let conversation = await M.Conversation.findOne({ where: { teacherId: teacher.id, studentId: student.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (conversation) { manifest.referenceConversations.push(conversation.id); conversations.set(student.id, conversation); continue; }
    conversation = await add('Conversation', { teacherId: teacher.id, studentId: student.id, createdById: student.id }, when);
    conversations.set(student.id, conversation);
    const text = [
      `Hola, ${teacher.name}. Estoy aprendiendo español y quisiera practicar conversación. Me interesa hablar de viajes y de la vida cotidiana.`,
      `Hola, ${student.name.split(' ')[0]}. Podemos trabajar con historias breves y preparar juntos cada encuentro. ¿Qué días te quedan cómodos?`,
      'Me vienen bien los martes o jueves. Ya terminé varias lecciones y quiero animarme a conversar sin traducir todo.',
      'Perfecto. Vamos a empezar con presentaciones y situaciones de todos los días. Al terminar te dejo expresiones para repasar.',
      'La práctica de esta semana me ayudó mucho. Pude pedir un café en español y seguir la conversación.',
      '¡Qué buen avance! En el próximo encuentro podemos ampliar esa conversación y contar lo que pasó después.'
    ];
    await many('Message', text.map((body, mi) => ({ conversationId: conversation.id, seq: mi + 1, senderId: mi % 2 ? teacher.id : student.id,
      type: 'text', body, clientMessageId: `master-${conversation.id}-${mi}`, createdAt: new Date(+when + (+anchor - +when) * mi / 7) })), when);
    // bulk helper establece createdAt común; actualizar cada mensaje conservando la secuencia temporal.
    const messages = await M.Message.findAll({ where: { conversationId: conversation.id }, order: [['seq','ASC']], transaction });
    for (const [mi, message] of messages.entries()) await message.update({ createdAt: new Date(+when + (+anchor - +when) * mi / 7) }, { transaction, silent: true });
    const last = messages.at(-1).createdAt;
    await conversation.update({ lastMessageSeq: text.length, lastMessageAt: last, teacherFirstReplyAt: messages[1].createdAt, updatedAt: last }, { transaction, silent: true });
    await many('ConversationParticipant', [{ conversationId: conversation.id, userId: teacher.id, role: 'teacher', lastReadSeq: si % 3 ? text.length : 4, emailNotifiedSeq: text.length },
      { conversationId: conversation.id, userId: student.id, role: 'student', lastReadSeq: si % 2 ? 4 : text.length, emailNotifiedSeq: text.length }], when);
  }
  const append = async (conversation, fields, when) => {
    const seq = conversation.lastMessageSeq + 1;
    await add('Message', { conversationId: conversation.id, seq, senderId: null, ...fields }, later(when, conversation.lastMessageAt));
    await conversation.update({ lastMessageSeq: seq, lastMessageAt: later(when, conversation.lastMessageAt), updatedAt: later(when, conversation.lastMessageAt) }, { transaction, silent: true });
  };
  const purchaseFor = async (student, version, when, { cohortId = null, beneficiaries = [student.id], status = 'paid' } = {}) => {
    const conversation = conversations.get(student.id);
    if (!conversation) return null;
    when = later(when, conversation.createdAt, version.createdAt, policy.createdAt);
    const expiry = new Date(+when + policy.rules.offerTtlHours * 3600000);
    const snapshot = { ...Object.fromEntries(FIELDS.map(k => [k, version[k]])), templateKey: `master-${version.id}`, templateVersionId: version.id, templateVersion: version.version,
      teacherId: teacher.id, teacherName: teacher.name, buyerId: student.id, beneficiaryIds: beneficiaries, cohortId,
      policyVersion: policy.version, policy: policy.rules, sentAt: when.toISOString(), expiresAt: expiry.toISOString(), legalDocuments: [], refundPolicyStatus: 'commercial_resolved', providerVerification: 'fake_unverified' };
    const offer = await add('ClassOffer', { conversationId: conversation.id, teacherId: teacher.id, buyerId: student.id, cohortId, templateVersionId: version.id, policyVersionId: policy.id, status,
      snapshot, amount: version.priceAmount, currency: version.currency, sessionsCount: version.sessionsCount, minutesPerSession: version.minutesPerSession, seatsCovered: version.seatsCovered,
      validityHours: version.validityHours, sentAt: when, expiresAt: expiry, idempotencyKey: randomUUID() }, when);
    await many('ClassOfferBeneficiary', beneficiaries.map(userId => ({ offerId: offer.id, userId })), when);
    await append(conversation, { type: 'offer', offerId: offer.id, eventCode: 'package_offer_sent', eventParams: { offerId: offer.id, amount: offer.amount, currency: offer.currency, sessionsCount: offer.sessionsCount, minutesPerSession: offer.minutesPerSession, seatsCovered: offer.seatsCovered } }, when);
    if (status !== 'paid') {
      if (status === 'checkout_pending') await add('ClassPackageOrder', { offerId: offer.id, buyerId: student.id, amount: offer.amount, currency: offer.currency,
        provider: 'fake', status: 'paid_needs_review', reviewReason: 'amount_mismatch', checkoutRef: randomBytes(16).toString('hex'),
        providerTransactionId: `master-review-${randomUUID()}`, paidAt: when, reportedAmount: offer.amount - 100, reportedCurrency: offer.currency, buyerEmailReported: student.email }, when);
      return null;
    }
    const order = await add('ClassPackageOrder', { offerId: offer.id, buyerId: student.id, amount: offer.amount, currency: offer.currency, provider: 'fake', status: 'paid', checkoutRef: randomBytes(16).toString('hex'),
      providerTransactionId: `master-${randomUUID()}`, reportedAmount: offer.amount, reportedCurrency: offer.currency, buyerEmailReported: student.email, paidAt: when }, when);
    const purchase = await add('ClassPackagePurchase', { orderId: order.id, offerId: offer.id, teacherId: teacher.id, buyerId: student.id, cohortId, templateVersionId: version.id, policyVersionId: policy.id,
      snapshot, minutesPerSession: version.minutesPerSession, seatsCovered: version.seatsCovered, paidAt: when, expiresAt: new Date(+when + version.validityHours * 3600000) }, when);
    await many('ClassPackageBeneficiary', beneficiaries.map(userId => ({ purchaseId: purchase.id, userId })), when);
    const movement = await credits.apply({ purchaseId: purchase.id, operation: 'grant', units: version.sessionsCount, operationKey: `grant:master:${purchase.id}`, actorId: teacher.id }, { transaction });
    (manifest.rows.ClassCreditLedger ||= []).push(movement.entry.id);
    await movement.entry.update({ createdAt: when }, { transaction, silent: true });
    await purchase.reload({ transaction }); return { purchase, order, offer, conversation };
  };
  const move = async (pkg, operation, session, at, units = 1) => {
    const result = await credits.apply({ purchaseId: pkg.purchase.id, operation, units, classSessionId: session?.id || null, actorId: teacher.id,
      operationKey: `${operation}:master:${pkg.purchase.id}:${session?.id || 'all'}` }, { transaction });
    (manifest.rows.ClassCreditLedger ||= []).push(result.entry.id);
    await result.entry.update({ createdAt: at }, { transaction, silent: true });
    await pkg.purchase.update({ updatedAt: at }, { transaction, silent: true }); await pkg.purchase.reload({ transaction });
  };
  const sessionFor = async (pkgList, participants, startsAt, status, cohortId = null) => {
    const version = pkgList[0].purchase; const minutes = version.minutesPerSession;
    const participantIds = participants.map(p => p.id);
    const commitments = await M.ClassSessionParticipant.findAll({ where: { userId: participantIds }, attributes: ['sessionId'], transaction });
    const occupied = await M.ClassSession.findAll({ where: { status: ['proposed','forming','confirmed','completed','student_no_show'], [Op.or]: [{ teacherId: teacher.id }, { id: commitments.map(c => c.sessionId) }] }, transaction });
    let attempts = 0;
    while (occupied.some(s => +startsAt < +s.endsAt + 600000 && +startsAt + minutes * 60000 + 600000 > +s.startsAt)) {
      startsAt = new Date(+startsAt + 90 * 60000);
      if (++attempts > 100) throw new Error('No se encontró un horario libre para el seed; no se guardó nada.');
    }
    if (cohortId) await M.ClassCohort.update({ tentativeStartsAt: startsAt }, { where: { id: cohortId }, transaction });

    const when = later(...pkgList.map(p => p.purchase.paidAt));
    const proposalAt = new Date(Math.min(+anchor - 3600000, +startsAt - 3 * DAY));
    // La intención local se deriva del instante, nunca del huso del proceso.
    const { Temporal } = require('@js-temporal/polyfill');
    const zone = 'America/Argentina/Cordoba';
    const z = Temporal.Instant.from(startsAt.toISOString()).toZonedDateTimeISO(zone);
    const time = { startsAt, endsAt: new Date(+startsAt + minutes * 60000), timeZone: zone, localStart: z.toPlainDateTime().toString().slice(0,16), utcOffset: z.offset, disambiguation: 'none', minutes };
    const confirmed = status !== 'proposed';
    const acceptedAt = later(when, proposalAt);
    const session = await add('ClassSession', { teacherId: teacher.id, kind: participants.length > 1 ? 'group' : 'individual', cohortId, status, ...time,
      confirmedAt: confirmed ? acceptedAt : null, cancelledAt: status === 'cancelled' ? new Date(+startsAt - 2 * DAY) : null,
      cancelledById: status === 'cancelled' ? teacher.id : null, cancelReason: status === 'cancelled' ? 'Cambio de disponibilidad acordado con el alumno.' : null }, acceptedAt);
    await add('ClassSessionProposal', { sessionId: session.id, version: 1, kind: 'initial', status: confirmed ? 'accepted' : 'pending', ...time, proposedById: teacher.id,
      expiresAt: new Date(+acceptedAt + DAY), resolvedAt: confirmed ? acceptedAt : null }, acceptedAt);
    await many('ClassSessionParticipant', participants.map((student, pi) => ({ sessionId: session.id, userId: student.id, purchaseId: pkgList.length === 1 ? pkgList[0].purchase.id : pkgList[pi].purchase.id,
      status: status === 'cancelled' ? 'cancelled' : confirmed ? 'confirmed' : 'invited', acceptedVersion: confirmed ? 1 : null, acceptedAt: confirmed ? acceptedAt : null,
      attendance: status === 'completed' ? 'attended' : status === 'student_no_show' ? 'student_no_show' : 'pending',
      attendanceMarkedById: ['completed','student_no_show'].includes(status) ? teacher.id : null, attendanceMarkedAt: ['completed','student_no_show'].includes(status) ? time.endsAt : null })), acceptedAt);
    if (confirmed) for (const pkg of pkgList) {
      await move(pkg, 'reserve', session, acceptedAt);
      if (['completed','student_no_show'].includes(status)) await move(pkg, 'consume', session, time.endsAt);
      if (status === 'cancelled') await move(pkg, 'release', session, session.cancelledAt);
    }
    for (const pkg of pkgList) await append(pkg.conversation, { type: 'session_proposal', classSessionId: session.id, proposalVersion: 1,
      eventCode: 'session_proposed', eventParams: { sessionId: session.id, version: 1 } }, acceptedAt);
    if (status === 'completed') {
      const board = restoreBoard({ format: 'spanishnow-live-board', version: 1, board: { activePageId: 'master_page_1', pages: [{ id: 'master_page_1', title: 'Lo que practicamos hoy', background: 'dots', elements: [
        { id: 'master_heading', type: 'text', x: 100, y: 70, w: 1100, h: 100, color: '#3d1420', width: 3, text: 'Una historia, muchas formas de contarla' },
        { id: 'master_note_one', type: 'note', x: 100, y: 220, w: 400, h: 220, color: '#f8d685', width: 2, text: 'Primero: ¿quién es el personaje?\nDespués: ¿qué quiere?\nAl final: ¿qué cambia?' },
        { id: 'master_note_two', type: 'note', x: 650, y: 220, w: 500, h: 250, color: '#a6d8ce', width: 2, text: 'Expresiones de hoy\nquiere · encuentra · acuerdan\n\nPara la próxima clase: contar una experiencia del fin de semana.' }
      ] }] } }, teacher.id);
      const live = await add('LiveClass', { teacherId: teacher.id, courseId: null, title: `Conversación guiada · ${participants.map(s => s.name.split(' ')[0]).join(', ')}`,
        status: 'ended', joinCode: randomBytes(12).toString('base64url'), board, revision: 1 }, startsAt);
      await live.update({ updatedAt: time.endsAt }, { transaction, silent: true });
      await session.update({ liveClassId: live.id, updatedAt: time.endsAt }, { transaction, silent: true });
      await many('LiveClassMember', [teacher, ...participants].map(s => ({ liveClassId: live.id, userId: s.id, lastSeenAt: time.endsAt })), startsAt);
    }
    return session;
  };
  // Historial distribuido sin cruces: una sola sesión por día y docente.
  for (let i = 0; i < 16; i++) {
    const student = students[i]; if (!conversations.has(student.id)) continue;
    const startsAt = new Date(+anchor - (80 - i * 4) * DAY + (15 + teacherIndex * 2) * 3600000);
    const paidAt = new Date(+startsAt - 5 * DAY);
    if (paidAt < teacher.createdAt || paidAt < student.createdAt || paidAt < policy.createdAt) continue;
    const pkg = await purchaseFor(student, versions[i % 3 === 0 ? 1 : 3], paidAt);
    const status = i % 5 === 0 ? 'cancelled' : i % 7 === 0 ? 'student_no_show' : 'completed';
    await sessionFor([pkg], [student], startsAt, status);
    await pkg.purchase.reload({ transaction });
    if (pkg.purchase.expiresAt <= anchor) {
      if (pkg.purchase.unitsAvailable) await move(pkg, 'expire', null, pkg.purchase.expiresAt, pkg.purchase.unitsAvailable);
      await pkg.purchase.update({ status: 'expired' }, { transaction });
    }
  }
  // Docentes recién creados también tienen un historial breve y verosímil, nunca anterior a su alta.
  if (+teacher.createdAt > +anchor - 10 * DAY) for (let i = 0; i < 6; i++) {
    const student = students[i]; if (!conversations.has(student.id)) continue;
    const paidAt = later(versions[1].createdAt, policy.createdAt, teacher.createdAt, student.createdAt);
    const startsAt = new Date(+paidAt + (30 + i * 2) * 3600000);
    if (+startsAt + 2 * 3600000 >= +anchor) continue;
    const pkg = await purchaseFor(student, versions[1], paidAt);
    await sessionFor([pkg], [student], startsAt, 'completed');
  }
  // Compras recientes con saldo disponible, pausado, reembolsado y clases próximas.
  for (let i = 0; i < students.length; i++) {
    const student = students[i]; if (!conversations.has(student.id)) continue;
    const paidAt = later(new Date(+anchor - 7 * DAY), teacher.createdAt, student.createdAt, policy.createdAt);
    const pkg = await purchaseFor(student, versions[3], paidAt);
    if (i === 6) { await pkg.purchase.update({ status: 'paused', pausedAt: anchor, pauseCount: 1 }, { transaction }); continue; }
    if (i === 7) {
      await move(pkg, 'refund', null, anchor, pkg.purchase.unitsAvailable);
      await pkg.purchase.update({ status: 'cancelled', cancelledAt: anchor }, { transaction });
      await pkg.order.update({ status: 'refunded', refundedAmount: pkg.order.amount, refundedAt: anchor }, { transaction }); continue;
    }
    const startsAt = new Date(+anchor + (i + 4) * DAY + (15 + teacherIndex * 2) * 3600000);
    await sessionFor([pkg], [student], startsAt, i % 3 === 0 ? 'proposed' : 'confirmed');
  }
  for (const groupSize of [2,3]) {
    const members = students.slice(groupSize === 2 ? 18 : 20, groupSize === 2 ? 20 : 23);
    if (members.some(s => !conversations.has(s.id))) continue;
    const version = versions[groupSize === 2 ? 4 : 5];
    const when = later(new Date(+anchor - DAY), teacher.createdAt, policy.createdAt);
    const startsAt = new Date(+anchor + (groupSize === 2 ? 2 : 3) * DAY + (15 + teacherIndex * 2) * 3600000);
    const cohort = await add('ClassCohort', { teacherId: teacher.id, templateVersionId: version.id, groupSize, status: 'ready', formingDeadlineAt: new Date(+anchor + DAY), tentativeStartsAt: startsAt }, when);
    await many('ClassCohortMember', members.map(s => ({ cohortId: cohort.id, userId: s.id, invitedById: teacher.id, status: 'accepted', respondedAt: when })), when);
    const packages = groupSize === 2 ? [await purchaseFor(members[0], version, when, { cohortId: cohort.id, beneficiaries: members.map(s => s.id) })]
      : await Promise.all(members.map(s => purchaseFor(s, version, when, { cohortId: cohort.id })));
    await sessionFor(packages, members, startsAt, 'confirmed', cohort.id);
  }
  const formingAt = later(new Date(+anchor - DAY), teacher.createdAt, versions[5].createdAt);
  const forming = await add('ClassCohort', { teacherId: teacher.id, templateVersionId: versions[5].id, groupSize: 3,
    status: 'forming', formingDeadlineAt: new Date(+anchor + 5 * DAY), tentativeStartsAt: new Date(+anchor + 8 * DAY) }, formingAt);
  await many('ClassCohortMember', students.slice(14,17).map((s,i) => ({ cohortId: forming.id, userId: s.id, invitedById: teacher.id,
    status: i === 2 ? 'invited' : 'accepted', respondedAt: i === 2 ? null : formingAt })), formingAt);
  for (const student of students.slice(10,12)) if (conversations.has(student.id)) await purchaseFor(student, versions[1], anchor, { status: 'checkout_pending' });
  const student = students[17];
  if (conversations.has(student.id) && +teacher.createdAt < +anchor - 12 * DAY) await purchaseFor(student, versions[0], new Date(+anchor - 10 * DAY), { status: 'expired' });
  for (const conversation of conversations.values()) await M.ConversationParticipant.update({ emailNotifiedSeq: conversation.lastMessageSeq }, { where: { conversationId: conversation.id }, transaction });
}
module.exports = { KEY, run, verify, loadGraph };
