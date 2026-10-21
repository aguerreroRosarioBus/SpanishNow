// Payments configuration. PAYMENTS_FAKE=1 skips Stripe and confirms the order on the spot, for local development and E2E only.
// It is never allowed in production: the process refuses to start if both are set (same rule as config/fakeUploads.js).
const enabledFake = () => process.env.PAYMENTS_FAKE === '1';
const isProduction = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

function assertSafe() {
  if (enabledFake() && isProduction()) {
    throw new Error('PAYMENTS_FAKE=1 is not allowed in production; unset it');
  }
  if (isProduction() && !process.env.FRONTEND_URL) {
    console.warn('FRONTEND_URL is not set: checkout redirects and email links need it in production');
  }
}

/** Base URL of the web app used in redirects and emails, without trailing slash. */
function frontendUrl() {
  const url = process.env.FRONTEND_URL;
  if (!url) {
    if (isProduction()) throw new Error('FRONTEND_URL is required in production');
    return 'http://localhost:4200';
  }
  return url.replace(/\/+$/, '');
}

module.exports = { fake: enabledFake, assertSafe, frontendUrl, isProduction };
