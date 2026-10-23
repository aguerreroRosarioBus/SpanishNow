const {ClassPolicyVersion:Policy} = require('../models');
const {DEFAULT_POLICY_V1} = require('../domain/classPolicy');
const MODE = 'full_unused_then_review';
// La fila histórica es el mutex, no se edita. Las reglas nuevas conservan plazos más favorables.
async function current(actorId, transaction, base) {
  await Policy.findOrCreate({where:{version:1},defaults:{rules:DEFAULT_POLICY_V1,createdById:actorId},transaction});
  await Policy.findOne({order:[['version','ASC']],transaction,lock:transaction.LOCK.UPDATE});
  const latest = await Policy.findOne({order:[['version','DESC']],transaction,lock:transaction.LOCK.UPDATE});
  const source = base || latest;
  if (source.rules.refundMode === MODE && source.rules.refundWindowHours >= 360) return source;
  const rules = {...source.rules,refundWindowHours:Math.max(360,source.rules.refundWindowHours),refundMode:MODE};
  const rows = await Policy.findAll({order:[['version','DESC']],transaction,lock:transaction.LOCK.UPDATE});
  const match = rows.find(row=>require('util').isDeepStrictEqual(row.rules,rules));
  return match || Policy.create({version:latest.version+1,rules,createdById:actorId},{transaction});
}
module.exports={MODE,current};
