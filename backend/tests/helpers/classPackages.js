const { randomUUID } = require('crypto');
const { createUser } = require('./fixtures');
const catalog = require('../../src/services/classCatalog');
const { ClassPackageTemplateVersion: Version, TeacherClassSettings } = require('../../src/models');
const chat = require('../../src/services/chatService');
async function packageWorld({key='individual-4x50',modality}={}) {
  const teacher=await createUser('teacher','w05-teacher'); const buyer=await createUser('student','w05-buyer'); const other=await createUser('student','w05-other');
  const items=await catalog.importInitial(teacher); const t=items.find(t=>t.templateKey===key);
  const expectations=Object.fromEntries(['en','es'].map(l=>[l,Object.fromEntries(require('../../src/services/salesExpectations').FIELDS.map(k=>[k,`${l}: ${k}`]))]));
  const values=Object.fromEntries(catalog.FIELDS.map(k=>[k,t.current[k]]));
  const configured=await catalog.newVersion(teacher,t.id,{...values,version:1,expectations,hotmartProductId:`PKG-${randomUUID().slice(0,8)}`,hotmartOfferCode:`O-${t.id}`,hotmartCheckoutUrl:`https://pay.hotmart.com/PKG${t.id}`});
  await catalog.setStatus(teacher,t.id,{status:'active',version:configured.current.version});
  await TeacherClassSettings.update({classesEnabledAt:new Date(),salesPausedAt:null,acceptsInquiries:true},{where:{userId:teacher.id}});
  const {conversation}=await chat.startConversation(buyer,{teacherId:teacher.id});
  return {teacher,buyer,other,template:configured,version:await Version.findByPk(configured.current.id),conversation};
}
module.exports={packageWorld};
