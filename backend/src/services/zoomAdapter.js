// Fachada estable: W08 consume el adaptador fake o el real con el mismo contrato.
const features = require('../config/features');
const fake = require('./zoomFakeAdapter');
const real = require('./zoomRealAdapter');
const { ZoomError, fail, hash } = require('./zoomAdapterCore');

const REQUIRED = ['ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_REDIRECT_URI', 'ZOOM_WEBHOOK_SECRET_TOKEN'];
function isFake() {
  const fakeMode = process.env.INTEGRATIONS_FAKE === '1';
  if (fakeMode) features.assertSafe();
  return fakeMode;
}
function selected() {
  if (isFake()) return fake;
  const missing = REQUIRED.filter(name => !String(process.env[name] || '').trim());
  if (missing.length) fail('provider_unavailable', 503, { reason: 'not_configured', missing });
  return real;
}

const adapter = {
  ZoomError, fail, hash, isFake,
  assertConfigured() { selected(); },
  get scopes() { return selected().scopes; }
};
for (const method of ['issueAuthorization', 'authorizeUrl', 'authorize', 'refresh', 'revoke', 'capabilities', 'find', 'create', 'update', 'remove', 'host']) {
  adapter[method] = (...args) => {
    const provider = selected();
    if (typeof provider[method] !== 'function') fail('provider_unavailable', 503, { reason: 'not_supported' });
    return provider[method](...args);
  };
}

module.exports = adapter;
