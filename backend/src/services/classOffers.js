const sequelize = require('../config/database');
const { TeacherClassSettings, User, Conversation, ConversationParticipant, ClassPackageTemplate: Template, ClassPackageTemplateVersion: Version, ClassPolicyVersion: Policy, ClassOffer: Offer, ClassOfferBeneficiary: Beneficiary, ClassPackageOrder: Order, ClassCohort: Cohort, ClassCohortMember: Member } = require('../models');
const legal = require('./legalDocuments');
const catalog = require('./classCatalog');
const chat = require('./chatService');
const outbox = require('./outbox');
const { fail, invalid, validId, only, persistedSecond } = legal;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const sortedIds = ids => [...ids].sort((a,b) => a-b);
function key(value) { if (typeof value !== 'string' || !KEY.test(value)) throw invalid(['Idempotency-Key']); return value; }
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw fail(400, 'time_without_zone');
  const date = new Date(value); if (!Number.isFinite(date.getTime())) throw invalid(['tentativeStartsAt']); return persistedSecond(date);
}
async function teacherSettings(id, transaction, { selling = false } = {}) {
  const row = await TeacherClassSettings.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  const teacher = await User.findByPk(id, { transaction });
  if (selling && (!row?.classesEnabledAt || teacher?.role !== 'teacher' || teacher?.suspendedAt)) throw fail(409, 'teacher_unavailable');
  if (selling && row.salesPausedAt) throw fail(409, 'sales_paused');
  return row;
}
async function conversationFor(user, id, { transaction, lock = false } = {}) {
  if (!validId(id)) throw fail(404, 'not_found');
  const row = await Conversation.findByPk(id, { transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!row || ![row.teacherId,row.studentId].includes(user.id)) throw fail(404, 'not_found');
  return row;
}
async function load(user, id, options = {}) {
  if (!validId(id)) throw fail(404, 'not_found');
  const row = await Offer.findByPk(id, options);
  if (!row) throw fail(404, 'not_found');
  if (row.teacherId !== user.id && row.buyerId !== user.id && !await Beneficiary.findOne({ where: { offerId: row.id, userId: user.id }, transaction: options.transaction })) throw fail(404, 'not_found');
  return row;
}
function present(row) {
  const result = row.toJSON();
  // El enlace de pago solo se obtiene iniciando checkout autenticado.
  const { hotmartCheckoutUrl, ...snapshot } = result.snapshot;
  return { ...result, snapshot, status: ['sent','checkout_pending'].includes(row.status) && row.expiresAt <= new Date() ? 'expired' : row.status };
}
async function detail(user, id) { const row=await load(user,id); return {...present(row),canCheckout:row.buyerId===user.id,canManage:row.teacherId===user.id}; }
async function list(user,id) {
  await conversationFor(user,id);
  return (await Offer.findAll({ where:{conversationId:id},order:[['id','ASC']] })).map(present);
}
async function groupFor(version, buyerId, body, { transaction, now }) {
  const ids = body.beneficiaryIds === undefined ? [buyerId] : body.beneficiaryIds;
  if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id) || !validId(id)) || new Set(ids).size !== ids.length || !ids.includes(buyerId)) throw invalid(['beneficiaryIds']);
  if (version.modality === 'individual') {
    if (body.cohortId != null || ids.length !== 1 || ids[0] !== buyerId) throw invalid(['beneficiaryIds','cohortId']);
    return { beneficiaryIds:ids, cohort:null };
  }
  if (!validId(body.cohortId)) throw fail(409,'group_incomplete');
  const cohort = await Cohort.findByPk(body.cohortId,{transaction,lock:transaction.LOCK.UPDATE});
  if (!cohort || !['forming','ready'].includes(cohort.status) || cohort.templateVersionId !== version.id || cohort.formingDeadlineAt <= now || !cohort.tentativeStartsAt) throw fail(409,'group_incomplete');
  const members = await Member.findAll({where:{cohortId:cohort.id,status:'accepted'},transaction});
  if (members.length !== version.groupSize || !members.some(m=>m.userId===buyerId)) throw fail(409,'group_incomplete');
  const expected = version.billing === 'per_group' ? members.map(m=>m.userId) : [buyerId];
  if (JSON.stringify(sortedIds(ids)) !== JSON.stringify(sortedIds(expected))) throw fail(409,'group_incomplete');
  return {beneficiaryIds:sortedIds(ids),cohort};
}
function sameRequest(existing, conversationId, body, replacesOfferId) {
  const ids = sortedIds(body.beneficiaryIds || [existing.buyerId]);
  return existing.conversationId === Number(conversationId) && existing.templateVersionId === body.templateVersionId && (existing.cohortId || null) === (body.cohortId || null) &&
    (existing.replacesOfferId || null) === (replacesOfferId || null) && JSON.stringify(sortedIds(existing.snapshot.beneficiaryIds)) === JSON.stringify(ids);
}
async function closePending(row, status, reason, transaction, now) {
  if(status!=='expired' && await Order.findOne({where:{offerId:row.id,status:'paid_needs_review'},transaction})) throw fail(409,'offer_not_payable');
  const orders = await Order.findAll({where:{offerId:row.id,status:'pending'},transaction,lock:transaction.LOCK.UPDATE});
  for (const order of orders) await order.update({status:'failed',failedAt:now},{transaction});
  await row.update({status,cancelledAt:status==='expired'?null:now,cancelReason:reason},{transaction});
  await outbox.cancel({aggregateType:'class_offers',aggregateId:row.id,topicPrefix:'offer.expire'},{transaction});
  await chat.appendSystemMessage(row.conversationId,{eventCode:`package_offer_${status}`,offerId:row.id,eventParams:{offerId:row.id},dedupeKey:`offer:${row.id}:${status}`},{transaction});
}
async function send(user, conversationId, body, idempotencyKey, { replacesOfferId = null } = {}) {
  key(idempotencyKey);
  if (!only(body,['templateVersionId','cohortId','beneficiaryIds']) || !Number.isInteger(body.templateVersionId) || !validId(body.templateVersionId)) throw invalid(['templateVersionId']);
  if (body.cohortId != null && (!Number.isInteger(body.cohortId) || !validId(body.cohortId))) throw invalid(['cohortId']);
  if (body.beneficiaryIds !== undefined && (!Array.isArray(body.beneficiaryIds) || body.beneficiaryIds.some(id=>!Number.isInteger(id) || !validId(id)) || new Set(body.beneficiaryIds).size!==body.beneficiaryIds.length)) throw invalid(['beneficiaryIds']);
  const ref = await conversationFor(user,conversationId);
  if (user.role !== 'teacher' || ref.teacherId !== user.id) throw fail(404,'not_found');
  return sequelize.transaction(async transaction => {
    const now = persistedSecond(new Date());
    await teacherSettings(user.id,transaction);
    const conversation = await conversationFor(user,conversationId,{transaction,lock:true});
    const existing = await Offer.findOne({where:{teacherId:user.id,idempotencyKey},transaction});
    if (existing) {
      if (!sameRequest(existing,conversationId,body,replacesOfferId)) throw fail(409,'operation_key_conflict');
      return {offer:present(existing),created:false};
    }
    await teacherSettings(user.id,transaction,{selling:true});
    const participants = await ConversationParticipant.findAll({where:{conversationId:conversation.id},transaction});
    if (participants.some(p=>p.blockedAt)) throw fail(409,'conversation_blocked');
    const buyer = await User.findByPk(conversation.studentId,{transaction});
    if (!buyer || buyer.suspendedAt || buyer.role !== 'student') throw fail(409,'teacher_unavailable');
    const version = await Version.findByPk(body.templateVersionId,{transaction});
    if (!version) throw fail(404,'not_found');
    const template = await Template.findOne({where:{id:version.templateId,teacherId:user.id},transaction,lock:transaction.LOCK.UPDATE});
    if (!template) throw fail(404,'not_found');
    if (template.status !== 'active' || template.currentVersionId !== version.id) throw fail(409,'version_conflict');
    catalog.assertReady(version);
    const policy = await Policy.findByPk(version.policyVersionId,{transaction});
    const {beneficiaryIds,cohort} = await groupFor(version,conversation.studentId,body,{transaction,now});
    if (cohort) {
      const active = await Offer.findAll({where:{cohortId:cohort.id,buyerId:conversation.studentId,status:['sent','checkout_pending','paid']},transaction});
      if (active.some(o=>o.id!==replacesOfferId)) throw fail(409,'group_incomplete');
    }
    const expiresAt = new Date(Math.min(now.getTime()+policy.rules.offerTtlHours*3600000,cohort?.formingDeadlineAt.getTime() ?? Infinity));
    if (expiresAt <= now) throw fail(409,'offer_expired');
    let previous;
    if (replacesOfferId) {
      previous = await load(user,replacesOfferId,{transaction,lock:transaction.LOCK.UPDATE});
      if (previous.teacherId !== user.id || previous.conversationId !== conversation.id || !['sent','checkout_pending'].includes(previous.status)) throw fail(409,'offer_not_payable');
      await closePending(previous,'replaced','Reemplazada por una nueva oferta',transaction,now);
    }
    const docs = await legal.currentSet(legal.KEYS,{transaction});
    const values = Object.fromEntries(catalog.FIELDS.map(k=>[k,version[k]]));
    const teacher = await User.findByPk(user.id,{transaction});
    const snapshot = {...values,refundPolicyStatus:'pending_validation',templateKey:template.templateKey,templateVersionId:version.id,templateVersion:version.version,teacherId:user.id,teacherName:teacher.name,buyerId:conversation.studentId,beneficiaryIds,cohortId:cohort?.id || null,
      policyVersion:policy.version,policy:policy.rules,sentAt:now.toISOString(),expiresAt:expiresAt.toISOString(),
      legalDocuments:docs.map(d=>({documentKey:d.documentKey,version:String(d.version),content:d.content,business:d.business,effectiveAt:d.effectiveAt.toISOString()}))};
    const row = await Offer.create({conversationId:conversation.id,teacherId:user.id,buyerId:conversation.studentId,cohortId:cohort?.id || null,templateVersionId:version.id,policyVersionId:policy.id,replacesOfferId,status:'sent',snapshot,
      amount:version.priceAmount,currency:version.currency,sessionsCount:version.sessionsCount,minutesPerSession:version.minutesPerSession,seatsCovered:version.seatsCovered,validityHours:version.validityHours,hotmartProductId:version.hotmartProductId,hotmartOfferCode:version.hotmartOfferCode,sentAt:now,expiresAt,idempotencyKey},{transaction});
    await Beneficiary.bulkCreate(beneficiaryIds.map(userId=>({offerId:row.id,userId})),{transaction});
    await chat.appendSystemMessage(conversation.id,{type:'offer',eventCode:'package_offer_sent',offerId:row.id,eventParams:{offerId:row.id,amount:row.amount,currency:row.currency,sessionsCount:row.sessionsCount,minutesPerSession:row.minutesPerSession,seatsCovered:row.seatsCovered},dedupeKey:`offer:${row.id}:sent`,contextType:'package',contextId:template.id},{transaction});
    await outbox.enqueue({topic:'offer.expire',aggregateType:'class_offers',aggregateId:row.id,dedupeKey:`offer.expire:${row.id}`,payload:{},runAt:expiresAt},{transaction});
    return {offer:present(row),created:true};
  });
}
async function cancel(user,id,body) {
  if (!only(body,['reason']) || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length>500) throw invalid(['reason']);
  const ref=await load(user,id);
  if (ref.teacherId !== user.id) throw fail(404,'not_found');
  return sequelize.transaction(async transaction=>{
    await teacherSettings(ref.teacherId,transaction);
    await conversationFor(user,ref.conversationId,{transaction,lock:true});
    const row=await load(user,id,{transaction,lock:transaction.LOCK.UPDATE});
    if (row.status==='cancelled') return present(row);
    if (!['sent','checkout_pending'].includes(row.status)) throw fail(409,'offer_not_payable');
    await closePending(row,'cancelled',body.reason.trim(),transaction,persistedSecond(new Date())); return present(row);
  });
}
async function expire(job) {
  const ref=await Offer.findByPk(job.aggregateId); if (!ref) return;
  return sequelize.transaction(async transaction=>{
    await teacherSettings(ref.teacherId,transaction);
    await Conversation.findByPk(ref.conversationId,{transaction,lock:transaction.LOCK.UPDATE});
    const row=await Offer.findByPk(ref.id,{transaction,lock:transaction.LOCK.UPDATE});
    if (!['sent','checkout_pending'].includes(row.status) || row.expiresAt>new Date()) return;
    await closePending(row,'expired',null,transaction,persistedSecond(new Date()));
  });
}
outbox.register('offer.expire',expire);
module.exports={key,instant,teacherSettings,conversationFor,load,present,detail,list,send,cancel,expire,groupFor,closePending};
