// Emails propios EN/ES según preferencia del destinatario. HTML escapado y texto plano.
const { frontendUrl } = require('../config/payments');
const { emailLocale, emailText } = require('./emailMessages');

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Cursos existentes expresados en centavos; código de moneda explícito en ambos idiomas. */
function formatMoney(cents, currency, locale = 'en') {
  try {
    return new Intl.NumberFormat(emailLocale(locale) === 'es' ? 'es-AR' : 'en-US', {
      style: 'currency', currency: String(currency).toUpperCase(), currencyDisplay: 'code'
    }).format(cents / 100);
  } catch (error) {
    return `${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;
  }
}

const FALLBACK = {
  en: 'If the button does not work, copy this link into your browser:',
  es: 'Si el botón no funciona, copia este enlace en tu navegador:'
};

// `quote`: text written by a person (a comment). Shown apart, line breaks kept, always escaped. `lang`: 'en' (default) or 'es'.
function layout({ title, paragraphs, button, footer, quote, lang = 'en' }) {
  const body = paragraphs.map(p => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join('');
  const quoted = quote ? `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:4px solid #cbd5e1;background:#f8fafc;white-space:pre-wrap;line-height:1.5">${escapeHtml(quote)}</blockquote>` : '';
  const action = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">${escapeHtml(button.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#555">${FALLBACK[lang]}<br><a href="${escapeHtml(button.url)}">${escapeHtml(button.url)}</a></p>`
    : '';
  const note = footer ? `<p style="margin:16px 0 0;font-size:13px;color:#555">${escapeHtml(footer)}</p>` : '';
  return `<!doctype html><html lang="${lang}"><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:22px;margin:0 0 20px">${escapeHtml(title)}</h1>${body}${quoted}${action}${note}
</body></html>`;
}

function plain({ title, paragraphs, button, footer, quote }) {
  const quoted = quote ? [quote.split('\n').map(line => `> ${line}`).join('\n'), ''] : [];
  return [title, '', ...paragraphs.flatMap(p => [p, '']), ...quoted, ...(button ? [`${button.label}: ${button.url}`, ''] : []), ...(footer ? [footer] : [])].join('\n').trim();
}

const build = (subject, content) => ({ subject, text: plain(content), html: layout(content) });

const courseUrl = course => `${frontendUrl()}/student/course/${course.id}/play`;
const passwordUrl = (token, { invite = false } = {}) =>
  `${frontendUrl()}/auth/reset-password?token=${encodeURIComponent(token)}${invite ? '&invite=1' : ''}`;

/** Purchase confirmation. With `inviteToken` (new account) the button asks the buyer to set a password. */
function purchaseConfirmation({ name, course, amount, currency, inviteToken, locale }) {
  const lang = emailLocale(locale);
  const t = (key, params) => emailText(lang, key, params);
  const paragraphs = [
    t('email.greeting', { name: name || t('email.defaultName') }),
    t('email.purchaseThanks', { course: course.title }),
    t('email.amountPaid', { amount: formatMoney(amount, currency, lang) })
  ];
  if (inviteToken) paragraphs.push(t('email.accountCreated'));
  const content = {
    lang,
    title: t('email.purchaseTitle'),
    paragraphs,
    button: inviteToken
      ? { label: t('email.setPassword'), url: passwordUrl(inviteToken, { invite: true }) }
      : { label: t('email.startLearning'), url: courseUrl(course) },
    footer: inviteToken ? t('email.inviteExpiry') : undefined
  };
  const email = build(t('email.purchaseSubject', { course: course.title }), content);
  if (inviteToken) {
    // A new buyer needs both: choose a password first, then open the course.
    email.text += `\n\n${t('email.courseLink')} ${courseUrl(course)}`;
    email.html = email.html.replace('</body>', `<p style="font-size:13px;color:#555">${escapeHtml(t('email.courseLink'))} <a href="${escapeHtml(courseUrl(course))}">${escapeHtml(courseUrl(course))}</a></p></body>`);
  }
  return email;
}

/**
 * Invitation for students moved from Hotmart (import) or added by hand. `hasAccount` is true for people who already
 * chose a password: they get a sign-in link instead of a set-password link.
 */
function invitation({ name, course, teacherName, inviteToken, hasAccount, locale }) {
  const lang = emailLocale(locale);
  const t = (key, params) => emailText(lang, key, params);
  const teacher = teacherName || t('email.defaultTeacher');
  const paragraphs = [
    t('email.greeting', { name: name || t('email.defaultName') }),
    t('email.courseMoved', { teacher, course: course.title }),
    t('email.hotmartValid')
  ];
  if (hasAccount) paragraphs.push(t('email.usualAccount'));
  else paragraphs.push(t('email.accountCreated'));
  return build(t('email.inviteSubject', { teacher }), {
    lang,
    title: t('email.inviteTitle', { course: course.title }),
    paragraphs,
    button: hasAccount
      ? { label: t('email.startLearning'), url: courseUrl(course) }
      : { label: t('email.setPassword'), url: passwordUrl(inviteToken, { invite: true }) },
    footer: hasAccount ? undefined : t('email.inviteExpiry')
  });
}

function passwordReset({ name, token, locale }) {
  const lang = emailLocale(locale);
  const t = (key, params) => emailText(lang, key, params);
  return build(t('email.resetSubject'), {
    lang,
    title: t('email.resetTitle'),
    paragraphs: [
      t('email.greeting', { name: name || t('email.defaultName') }),
      t('email.resetRequest')
    ],
    button: { label: t('email.resetButton'), url: passwordUrl(token) },
    footer: t('email.resetExpiry')
  });
}

const teacherManageUrl = (course, story) => `${frontendUrl()}/teacher/course/${course.id}/manage?story=${story.id}`;
const lessonUrl = (course, story) => `${frontendUrl()}/student/course/${course.id}/play?story=${story.id}`;

/** Aviso al docente en su idioma, conservando el mensaje original. */
function newQuestion({ teacherName, authorName, course, story, body, locale }) {
  const lang = emailLocale(locale);
  const t = (key, params) => emailText(lang, key, params);
  return build(t('email.questionSubject', { story: story.title }), {
    lang,
    title: t('email.questionTitle'),
    paragraphs: [
      t('email.greeting', { name: teacherName || t('email.defaultName') }),
      t('email.questionBody', { story: story.title, course: course.title }),
      t('email.questionAuthor', { author: authorName || t('email.defaultAuthor') })
    ],
    quote: body,
    button: { label: t('email.viewLesson'), url: teacherManageUrl(course, story) },
    footer: t('email.questionFooter')
  });
}

/** Aviso al alumno en su idioma; la respuesta humana nunca se traduce. */
function teacherReplied({ studentName, teacherName, course, story, body, locale }) {
  const lang = emailLocale(locale);
  const t = (key, params) => emailText(lang, key, params);
  const teacher = teacherName || t('email.defaultTeacher');
  return build(t('email.replySubject', { teacher, story: story.title }), {
    lang,
    title: t('email.replyTitle'),
    paragraphs: [
      t('email.greeting', { name: studentName || t('email.defaultName') }),
      t('email.replyBody', { teacher, story: story.title, course: course.title })
    ],
    quote: body,
    button: { label: t('email.openLesson'), url: lessonUrl(course, story) }
  });
}

/** W04 (CHAT-09): unread chat messages, in the recipient's language and without the message text. */
function chatUnread({ recipientName, senderName, count, conversationId, locale }) {
  const lang = emailLocale(locale);
  const t = (key, params) => emailText(lang, key, params);
  const name = senderName || 'SpanishNow';
  return build(t(count === 1 ? 'email.chatSubjectOne' : 'email.chatSubjectMany', { name, count }), {
    lang,
    title: t('email.chatTitle'),
    paragraphs: [
      t('email.greeting', { name: recipientName || t('email.defaultName') }),
      t('email.chatBody', { name }),
      t('email.chatPrivacy')
    ],
    button: { label: t('email.chatButton'), url: `${frontendUrl()}/messages/${conversationId}` },
    footer: t('email.chatFooter')
  });
}

module.exports = { purchaseConfirmation, invitation, passwordReset, newQuestion, teacherReplied, chatUnread, formatMoney, passwordUrl, courseUrl };
