const {ClassPackagePurchase:Purchase,ClassPackageOrder:Order,User,AuditLog}=require('../models');
const {sendMail}=require('./mailService');
const {frontendUrl}=require('../config/payments');
const outbox=require('./outbox');
const MESSAGES={
  en:{'packages.email.subject':'Your class package is confirmed','packages.email.body':'{name}: {sessions} sessions × {minutes} minutes. Paid: {price}. Valid until {expiry} ({zone}). Agree on session dates in your private conversation. View your balance: {url}'},
  es:{'packages.email.subject':'Tu paquete de clases está confirmado','packages.email.body':'{name}: {sessions} sesiones × {minutes} minutos. Pagado: {price}. Vigente hasta {expiry} ({zone}). Acordá las fechas en tu conversación privada. Consultá tu saldo: {url}'}
};
const t=(locale,key,params={})=>MESSAGES[locale][key].replace(/\{(\w+)\}/g,(_,k)=>String(params[k]));
async function sent(job,action){return AuditLog.findOne({where:{action,entityType:job.aggregateType,entityId:job.aggregateId,reason:job.dedupeKey}});}
async function confirmation(job,ctx={}){
  if(await sent(job,'package.email_delivered'))return;
  const p=await Purchase.findByPk(job.aggregateId);if(!p)return;const order=await Order.findByPk(p.orderId);
  if(!['paid','partially_refunded'].includes(order?.status))return;
  const user=await User.findByPk(p.buyerId);if(!user||user.suspendedAt)return;
  const locale=user.locale==='es'?'es':'en';const intl=locale==='es'?'es-AR':'en-US';const zone=user.timeZone||'UTC';
  const money=new Intl.NumberFormat(intl,{style:'currency',currency:order.currency,currencyDisplay:'code'});
  const digits=money.resolvedOptions().maximumFractionDigits;
  const expiry=new Intl.DateTimeFormat(intl,{timeZone:zone,year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'longOffset'}).format(p.expiresAt);
  if(ctx.stillOwned&&!(await ctx.stillOwned()))return;
  await sendMail({to:user.email,subject:t(locale,'packages.email.subject'),text:t(locale,'packages.email.body',{name:locale==='es'?p.snapshot.nameEs:p.snapshot.nameEn,sessions:p.snapshot.sessionsCount,minutes:p.minutesPerSession,price:money.format(order.amount/10**digits),expiry,zone,url:`${frontendUrl()}/class-packages/${p.id}`})});
  await AuditLog.create({action:'package.email_delivered',entityType:job.aggregateType,entityId:job.aggregateId,reason:job.dedupeKey});
}
async function attention(job){
  if(await sent(job,'payment.attention'))return;
  await AuditLog.create({action:'payment.attention',entityType:job.aggregateType,entityId:job.aggregateId,reason:job.dedupeKey,data:{topic:job.topic,reason:job.payload?.reason||null}});
}
outbox.register('email.purchase_confirmed',confirmation);
for(const topic of ['review.class_payment','review.incomplete_group','review.refunded_with_reservations','review.package_refund'])outbox.register(topic,attention);
module.exports={MESSAGES,confirmation,attention};
