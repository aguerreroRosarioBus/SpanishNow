// Class credits: the only way to move a purchase's balance (PACK-19, CONTRATO.md §6). Shared by W05 and W06.
// Every movement locks the purchase row, is idempotent by operationKey and keeps
//   unitsGranted = unitsAvailable + unitsReserved + unitsConsumed + unitsExpired + unitsRefunded
// (also a CHECK constraint in the database). The caller owns the transaction so the movement commits with its own changes.
const { ClassPackagePurchase, ClassCreditLedger } = require('../models');

class CreditError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

const COLUMN = { available: 'unitsAvailable', reserved: 'unitsReserved', consumed: 'unitsConsumed', expired: 'unitsExpired', refunded: 'unitsRefunded' };

// from -> to of each operation. 'none' is outside the balance (grants and negative adjustments).
const MOVES = {
  grant: [['none', 'available']],
  reserve: [['available', 'reserved']],
  release: [['reserved', 'available']],
  consume: [['reserved', 'consumed']],
  expire: [['available', 'expired']],
  refund: [['available', 'refunded']],
  adjust: [['none', 'available'], ['available', 'none'], ['consumed', 'available']]
};

// Reserving needs an active package; the rest also work on paused/expired/cancelled ones to settle commitments.
const NEEDS_ACTIVE = new Set(['reserve']);
const OPERATION_KEY = /^[a-z_]+:[A-Za-z0-9:_.-]{1,180}$/;

function moveOf(operation, adjust) {
  const moves = MOVES[operation];
  if (!moves) throw new CreditError(400, 'invalid_credit_operation', `Operación de saldo desconocida: ${operation}`);
  if (operation !== 'adjust') return moves[0];
  const wanted = adjust && [adjust.from, adjust.to];
  const move = wanted && moves.find(([from, to]) => from === wanted[0] && to === wanted[1]);
  if (!move) throw new CreditError(400, 'invalid_credit_operation', 'Un ajuste debe indicar from/to válidos');
  return move;
}

const balanceOf = purchase => ({
  granted: purchase.unitsGranted,
  available: purchase.unitsAvailable,
  reserved: purchase.unitsReserved,
  consumed: purchase.unitsConsumed,
  expired: purchase.unitsExpired,
  refunded: purchase.unitsRefunded
});

/**
 * Applies one movement inside `transaction` (required). Returns { entry, purchase, replayed }.
 * Repeating an operationKey with the same data is a no-op (replayed: true); with different data it is a 409.
 */
async function apply({ purchaseId, operation, units, operationKey, classSessionId = null, actorId = null, reason = null, adjust = null }, { transaction } = {}) {
  if (!transaction) throw new Error('classCredits.apply needs a transaction');
  if (!Number.isSafeInteger(units) || units <= 0) throw new CreditError(400, 'invalid_credit_operation', 'units debe ser un entero positivo');
  if (!OPERATION_KEY.test(String(operationKey || ''))) throw new CreditError(400, 'invalid_credit_operation', 'operationKey no válida');
  if (operation === 'adjust' && !(reason && actorId)) throw new CreditError(400, 'invalid_credit_operation', 'Un ajuste requiere responsable y motivo');
  const [from, to] = moveOf(operation, adjust);

  const purchase = await ClassPackagePurchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!purchase) throw new CreditError(404, 'not_found', 'Compra no encontrada');

  // Checked under the purchase lock, so two deliveries of the same operation cannot both pass.
  const existing = await ClassCreditLedger.findOne({ where: { operationKey }, transaction });
  if (existing) {
    const same = existing.purchaseId === purchase.id && existing.operation === operation && existing.units === units
      && existing.fromBucket === from && existing.toBucket === to;
    if (!same) throw new CreditError(409, 'operation_key_conflict', 'La clave de operación ya se usó con otros datos');
    return { entry: existing, purchase, replayed: true };
  }

  if (NEEDS_ACTIVE.has(operation) && purchase.status !== 'active') {
    throw new CreditError(409, 'package_not_active', 'El paquete no está activo', { status: purchase.status });
  }
  if (from !== 'none' && purchase[COLUMN[from]] < units) {
    throw new CreditError(409, 'insufficient_credit', 'Saldo insuficiente', { bucket: from, available: purchase[COLUMN[from]], requested: units });
  }

  const changes = {};
  if (from !== 'none') changes[COLUMN[from]] = purchase[COLUMN[from]] - units;
  if (to !== 'none') changes[COLUMN[to]] = (changes[COLUMN[to]] ?? purchase[COLUMN[to]]) + units;
  if (from === 'none') changes.unitsGranted = purchase.unitsGranted + units;
  if (to === 'none') changes.unitsGranted = purchase.unitsGranted - units;

  const next = { ...balanceOf(purchase), ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k.replace(/^units/, '').toLowerCase(), v])) };
  if (operation === 'consume' && purchase.status === 'active' && next.available === 0 && next.reserved === 0) changes.status = 'exhausted';
  if (purchase.status === 'exhausted' && next.available > 0 && purchase.expiresAt > new Date()) changes.status = 'active';
  changes.version = purchase.version + 1;

  await purchase.update(changes, { transaction });
  const entry = await ClassCreditLedger.create({
    purchaseId: purchase.id, operation, units, fromBucket: from, toBucket: to, operationKey, classSessionId, actorId,
    reason: reason ? String(reason).slice(0, 255) : null
  }, { transaction });
  return { entry, purchase, replayed: false };
}

/** Current balance of a purchase, by bucket. */
async function balance(purchaseId, { transaction } = {}) {
  const purchase = await ClassPackagePurchase.findByPk(purchaseId, { transaction });
  if (!purchase) throw new CreditError(404, 'not_found', 'Compra no encontrada');
  return balanceOf(purchase);
}

module.exports = { apply, balance, CreditError, MOVES };
