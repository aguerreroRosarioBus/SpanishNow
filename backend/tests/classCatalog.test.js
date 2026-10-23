const request = require('supertest');
const { app, as, createUser } = require('./helpers/fixtures');
const { ClassPackageTemplate: Template, ClassPackageTemplateVersion: Version, TeacherClassSettings, ClassPolicyVersion: Policy, Course, AuditLog } = require('../src/models');
const { FIELDS } = require('../src/services/salesExpectations');
const initial = require('../src/domain/classInitialCatalog');
const patch = async (user, path, body) => {
  if(path.endsWith('/status') && body.version===undefined){const id=path.split('/')[3];const row=await Template.findByPk(id);body={...body,version:(await Version.findByPk(row.currentVersionId)).version};}
  return request(app).patch(`/api${path}`).set('Authorization', `Bearer ${user.token}`).send(body);
};
const complete = () => Object.fromEntries(['en', 'es'].map(l => [l, Object.fromEntries(FIELDS.map(k => [k, `${l}: ${k}`]))]));
const fields = v => Object.fromEntries(require('../src/services/classCatalog').FIELDS.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
const mapping = id => ({ hotmartProductId: `W05-${id}`, hotmartOfferCode: `offer-${id}`, hotmartCheckoutUrl: `https://pay.hotmart.com/W05${id}`, expectations: complete() });
let teacher, other, buyer, admin;
beforeAll(async () => {
  [teacher, other, buyer, admin] = await Promise.all(['teacher','teacher','student','student'].map((role,i) => createUser(role, `catalog-${i}`)));
  await admin.update({ permissions: ['class_packages.manage_all', 'class_teachers.manage'] });
});
beforeEach(() => { process.env.FEATURE_CLASS_PACKAGES = '1'; process.env.PAYMENTS_FAKE='1'; });
afterEach(() => { delete process.env.FEATURE_CLASS_PACKAGES; });

test('importación explícita concurrente, seis variantes exactas en borrador y ventas pausadas', async () => {
  expect(await Template.count({ where: { teacherId: teacher.id } })).toBe(0);
  const replies = await Promise.all([as(teacher).post('/api/teacher/class-packages/import-initial'), as(teacher).post('/api/teacher/class-packages/import-initial')]);
  expect(replies.map(r => r.status)).toEqual([200,200]);
  const items = replies[0].body; expect(items).toHaveLength(6);
  expect(items.map(t => t.current.priceAmount)).toEqual([1500,2500,5000,9000,3000,1500]);
  expect(items.map(t => t.current.seatsCovered)).toEqual([1,1,1,1,2,1]);
  for (const t of items) expect(t).toMatchObject({ status:'draft', current:{version:1,currency:'USD',hotmartProductId:null} });
  const settings = await TeacherClassSettings.findByPk(teacher.id);
  expect(settings.classesEnabledAt).toBeNull(); expect(settings.salesPausedAt).toBeInstanceOf(Date); expect(settings.acceptsInquiries).toBe(false);
  expect(await Template.count({where:{teacherId:other.id}})).toBe(0);
  expect(await Version.count({where:{templateId:items.map(t=>t.id)}})).toBe(6);
});
test('autorización por pertenencia y permisos globales; impersonación prohibida', async () => {
  const items = (await as(teacher).get('/api/teacher/class-packages')).body;
  expect((await as(null).get('/api/teacher/class-packages')).status).toBe(401);
  expect((await as(buyer).post('/api/teacher/class-packages/import-initial')).status).toBe(403);
  expect((await as(other).get(`/api/teacher/class-packages/${items[0].id}`)).status).toBe(404);
  expect((await patch(other,`/teacher/class-packages/${items[0].id}/status`,{status:'active'})).status).toBe(404);
  expect((await as(other).get(`/api/teacher/class-packages?teacherId=${teacher.id}`)).status).toBe(404);
  expect((await as(admin).get(`/api/teacher/class-packages?teacherId=${teacher.id}`)).body).toHaveLength(6);
  const token = require('jsonwebtoken').sign({id:teacher.id,impersonatedBy:admin.id},process.env.JWT_SECRET);
  expect((await request(app).post('/api/teacher/class-packages/import-initial').set('Authorization',`Bearer ${token}`)).status).toBe(403);
  expect((await patch(teacher,`/admin/class-teachers/${teacher.id}`,{enabled:true})).status).toBe(403);
});
test('edición concurrente publica una nueva versión; reimportar no pisa ni cambia la anterior', async () => {
  const t = (await as(teacher).get('/api/teacher/class-packages')).body[0];
  const original = (await Version.findByPk(t.current.id)).toJSON();
  const input = {...fields(t.current),...mapping(t.id),priceAmount:1900,version:1};
  const replies = await Promise.all([as(teacher).post(`/api/teacher/class-packages/${t.id}/versions`,input),as(teacher).post(`/api/teacher/class-packages/${t.id}/versions`,input)]);
  expect(replies.map(r=>r.status).sort()).toEqual([201,409]);
  expect((await Version.findByPk(t.current.id)).toJSON()).toEqual(original);
  const again = (await as(teacher).post('/api/teacher/class-packages/import-initial')).body.find(r=>r.id===t.id);
  expect(again.current).toMatchObject({version:2,priceAmount:1900});
  expect((await as(teacher).get(`/api/teacher/class-packages/${t.id}`)).body.versions).toHaveLength(2);
});
test('activación exige mapeo y expectativas; catálogo respeta habilitación y pausa sin exponer Hotmart', async () => {
  const items = (await as(teacher).get('/api/teacher/class-packages')).body; const t=items[0];
  expect((await patch(teacher,`/teacher/class-packages/${items[1].id}/status`,{status:'active'})).body.code).toBe('hotmart_mapping_missing');
  expect((await request(app).get(`/api/public/teachers/${teacher.id}/class-packages`)).status).toBe(404);
  const enabled=await patch(admin,`/admin/class-teachers/${teacher.id}`,{enabled:true}); expect(enabled.status).toBe(200); expect(enabled.body.salesPausedAt).toBeTruthy();
  expect(await AuditLog.count({where:{action:'class_teacher.enabled',entityId:teacher.id}})).toBe(1);
  expect((await patch(teacher,`/teacher/class-packages/${t.id}/status`,{status:'active'})).status).toBe(200);
  expect((await request(app).get(`/api/public/teachers/${teacher.id}/class-packages`)).body).toMatchObject({salesPaused:true,items:[]});
  expect((await patch(teacher,'/teacher/class-settings',{salesPaused:false})).status).toBe(200);
  const visible=await request(app).get(`/api/public/teachers/${teacher.id}/class-packages`); expect(visible.body.items).toHaveLength(1); expect(visible.body.items[0].current.hotmartProductId).toBeUndefined();
  expect((await patch(teacher,'/teacher/class-settings',{classesEnabledAt:'2020-01-01T00:00:00Z'})).status).toBe(400);
});
test('dinero entero, moneda ISO, capacidad D07, URL segura, claves y producto exclusivo de paquetes', async () => {
  const policy=await Policy.findOne(); const {templateKey,...base}=initial[0]; const input={...base,...mapping('new'),policyVersionId:policy.id};
  for(const bad of [{priceAmount:1.5},{currency:'usd'},{currency:'ZZZ'},{seatsCovered:2},{billing:'per_seat'},{hotmartCheckoutUrl:'https://pay.hotmart.com.evil.test/X'},{hotmartCheckoutUrl:'https://user:pass@pay.hotmart.com/X'},{unknown:true},{nameEs:''},{policyVersionId:999999}]) {
    expect((await as(teacher).post('/api/teacher/class-packages',{...input,...bad,templateKey:`invalid-${Date.now()}`})).status).toBe(400);
  }
  const course=await Course.create({teacherId:teacher.id,title:'Curso ficticio',level:'A1',hotmartProductId:'course-w05'});
  expect((await as(teacher).post('/api/teacher/class-packages',{...input,hotmartProductId:course.hotmartProductId,templateKey:'conflict'})).body.code).toBe('hotmart_product_conflict');
  const t=(await as(teacher).get('/api/teacher/class-packages')).body[0];
  expect(await require('../src/services/hotmartService').parseCourseFields({hotmartProductId:t.current.hotmartProductId},course)).toMatchObject({status:409});
  const created=await as(teacher).post('/api/teacher/class-packages',{...input,templateKey:'custom'}); expect(created.status).toBe(201); expect(created.body.status).toBe('draft');
});
test('políticas inmutables, permisos explícitos y flag apagado', async () => {
  const rules={...require('../src/domain/classPolicy').DEFAULT_POLICY_V1,refundMode:'full_unused_then_review',refundWindowHours:360,offerTtlHours:48};
  expect((await as(teacher).post('/api/admin/class-policies',{version:2,rules})).status).toBe(403);
  const latest=await Policy.findOne({order:[['version','DESC']]});const version=latest.version+1;
  expect((await as(admin).post('/api/admin/class-policies',{version,rules})).status).toBe(201);
  expect((await as(admin).post('/api/admin/class-policies',{version,rules})).body.code).toBe('version_conflict');
  expect((await Policy.findOne({where:{version:1}})).rules.offerTtlHours).toBe(168);
  await Policy.destroy({where:{version}}); // no queda como «última política» para otras suites (classRefundPolicy.current clona la última)
  process.env.FEATURE_CLASS_PACKAGES='0';
  expect((await as(teacher).post('/api/teacher/class-packages/import-initial')).body.code).toBe('feature_disabled');
  expect((await as(teacher).get('/api/teacher/class-settings')).status).toBe(200);
});
