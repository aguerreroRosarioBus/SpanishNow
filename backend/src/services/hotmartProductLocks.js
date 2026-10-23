const sequelize = require('../config/database');
// INSERT + SELECT FOR UPDATE en la misma transacción. Abarca la validación final y la escritura de ambos módulos.
async function lock(productId, transaction) {
  if (!productId) return;
  if (!transaction) throw new Error('El vínculo Hotmart requiere transacción');
  await sequelize.query('INSERT IGNORE INTO hotmart_product_locks (productId) VALUES (?)', { replacements: [productId], transaction });
  await sequelize.query('SELECT productId FROM hotmart_product_locks WHERE productId = ? FOR UPDATE', { replacements: [productId], transaction });
}
module.exports = { lock };
