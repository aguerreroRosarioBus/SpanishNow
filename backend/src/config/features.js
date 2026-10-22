// Feature flags of the classes/chat modules (SPEC §16, CONTRATO.md §11). All off unless set to 1.
// Turning a flag off hides new functionality; it never removes rights already bought.
// INTEGRATIONS_FAKE=1 replaces Google Calendar and Zoom with fake adapters and, like PAYMENTS_FAKE, is refused in production.
const { isProduction } = require('./payments');

const FEATURES = Object.freeze({
  chat: 'FEATURE_CHAT',
  class_packages: 'FEATURE_CLASS_PACKAGES',
  class_scheduling: 'FEATURE_CLASS_SCHEDULING',
  google_calendar: 'FEATURE_GOOGLE_CALENDAR',
  zoom: 'FEATURE_ZOOM'
});

function isEnabled(name) {
  if (!FEATURES[name]) throw new Error(`Unknown feature ${name}`);
  return process.env[FEATURES[name]] === '1';
}

/** { chat: false, ... } for GET /api/features. */
const all = () => Object.fromEntries(Object.keys(FEATURES).map(name => [name, isEnabled(name)]));

/** Express middleware: 404 feature_disabled while the module is off, so a disabled module looks absent. */
function requireFeature(name) {
  isEnabled(name); // fail at startup on a typo
  return (req, res, next) => (isEnabled(name)
    ? next()
    : res.status(404).json({ error: 'Esta función no está disponible', code: 'feature_disabled', params: { feature: name } }));
}

const integrationsFake = () => process.env.INTEGRATIONS_FAKE === '1';

function assertSafe() {
  if (integrationsFake() && isProduction()) throw new Error('INTEGRATIONS_FAKE=1 is not allowed in production; unset it');
}

module.exports = { FEATURES, isEnabled, all, requireFeature, integrationsFake, assertSafe };
