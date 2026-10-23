// Paquetes reales permanecen bloqueados hasta verificar cuenta, formato, garantía y mapeo.
// No existe una bandera que convierta evidencia sintética en una verificación de Hotmart.
const payments = require('../config/payments');
const {fail} = require('./legalDocuments');
function assertSelling() {
  payments.assertSafe();
  if (!payments.fake()) throw fail(503, 'package_provider_verification_required');
}
module.exports = {assertSelling};
