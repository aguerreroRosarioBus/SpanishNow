// Email templates (English, simple HTML plus plain text). Each returns { subject, text, html }.
const { frontendUrl } = require('../config/payments');

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** 1999 + 'usd' -> "$19.99" (USD) / "19.99 EUR" style via Intl. */
function formatMoney(cents, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency).toUpperCase() }).format(cents / 100);
  } catch (error) {
    return `${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;
  }
}

function layout({ title, paragraphs, button, footer }) {
  const body = paragraphs.map(p => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join('');
  const action = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">${escapeHtml(button.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#555">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(button.url)}">${escapeHtml(button.url)}</a></p>`
    : '';
  const note = footer ? `<p style="margin:16px 0 0;font-size:13px;color:#555">${escapeHtml(footer)}</p>` : '';
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:22px;margin:0 0 20px">${escapeHtml(title)}</h1>${body}${action}${note}
</body></html>`;
}

function plain({ title, paragraphs, button, footer }) {
  return [title, '', ...paragraphs.flatMap(p => [p, '']), ...(button ? [`${button.label}: ${button.url}`, ''] : []), ...(footer ? [footer] : [])].join('\n').trim();
}

const build = (subject, content) => ({ subject, text: plain(content), html: layout(content) });

const courseUrl = course => `${frontendUrl()}/student/course/${course.id}/play`;
const passwordUrl = (token, { invite = false } = {}) =>
  `${frontendUrl()}/auth/reset-password?token=${encodeURIComponent(token)}${invite ? '&invite=1' : ''}`;

/** Purchase confirmation. With `inviteToken` (new account) the button asks the buyer to set a password. */
function purchaseConfirmation({ name, course, amount, currency, inviteToken }) {
  const paragraphs = [
    `Hi ${name || 'there'},`,
    `Thank you for your purchase. You now have full access to "${course.title}".`,
    `Amount paid: ${formatMoney(amount, currency)}.`
  ];
  if (inviteToken) paragraphs.push('We created a SpanishNow account for you with this email address. Choose your password to sign in.');
  const content = {
    title: 'Your purchase is confirmed',
    paragraphs,
    button: inviteToken
      ? { label: 'Set your password', url: passwordUrl(inviteToken, { invite: true }) }
      : { label: 'Start learning', url: courseUrl(course) },
    footer: inviteToken ? 'This link is valid for 14 days. After that, use "Forgot your password?" on the sign-in page.' : undefined
  };
  const email = build(`Your purchase: ${course.title}`, content);
  if (inviteToken) {
    // A new buyer needs both: choose a password first, then open the course.
    email.text += `\n\nOnce you are in, your course is here: ${courseUrl(course)}`;
    email.html = email.html.replace('</body>', `<p style="font-size:13px;color:#555">Once you are in, your course is here: <a href="${escapeHtml(courseUrl(course))}">${escapeHtml(courseUrl(course))}</a></p></body>`);
  }
  return email;
}

/**
 * Invitation for students moved from Hotmart (import) or added by hand. `hasAccount` is true for people who already
 * chose a password: they get a sign-in link instead of a set-password link.
 */
function invitation({ name, course, teacherName, inviteToken, hasAccount }) {
  const teacher = teacherName || 'Your teacher';
  const paragraphs = [
    `Hi ${name || 'there'},`,
    `${teacher} has moved the course "${course.title}" to SpanishNow. It is now available in your SpanishNow account.`,
    'Your purchase on Hotmart is still valid: you keep full access to the course, at no extra cost.'
  ];
  if (hasAccount) paragraphs.push('Sign in with your usual email address and password to start learning.');
  else paragraphs.push('We created your account with this email address. Choose a password to get started.');
  return build(`${teacher} has moved your course to SpanishNow`, {
    title: `${course.title} is now on SpanishNow`,
    paragraphs,
    button: hasAccount
      ? { label: 'Start learning', url: courseUrl(course) }
      : { label: 'Set your password', url: passwordUrl(inviteToken, { invite: true }) },
    footer: hasAccount ? undefined : 'This link is valid for 14 days. After that, use "Forgot your password?" on the sign-in page.'
  });
}

function passwordReset({ name, token }) {
  return build('Reset your SpanishNow password', {
    title: 'Reset your password',
    paragraphs: [
      `Hi ${name || 'there'},`,
      'We received a request to reset the password of your SpanishNow account. Use the button below to choose a new one.'
    ],
    button: { label: 'Reset password', url: passwordUrl(token) },
    footer: 'This link expires in 1 hour. If you did not ask for it, you can ignore this email: your password stays the same.'
  });
}

module.exports = { purchaseConfirmation, invitation, passwordReset, formatMoney, passwordUrl, courseUrl };
