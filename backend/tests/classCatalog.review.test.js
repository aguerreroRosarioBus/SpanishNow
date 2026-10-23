const request = require('supertest');
const { app, createUser } = require('./helpers/fixtures');
const { Course, ClassPackageTemplateVersion: Version } = require('../src/models');
const catalog = require('../src/services/classCatalog');
const hotmart = require('../src/services/hotmartService');
const cloudinary = require('../src/config/cloudinary');
const { FIELDS } = require('../src/services/salesExpectations');
const fields = v => Object.fromEntries(catalog.FIELDS.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
const expectations = () => Object.fromEntries(['en','es'].map(l=>[l,Object.fromEntries(FIELDS.map(k=>[k,`${l}: ${k}`]))]));
beforeEach(()=>{process.env.FEATURE_CLASS_PACKAGES='1';});
afterEach(()=>{delete process.env.FEATURE_CLASS_PACKAGES;jest.restoreAllMocks();});

test('el PUT valida antes de una subida lenta, pero vuelve a validar bajo el cerrojo antes de escribir', async()=>{
  const teacher=await createUser('teacher','catalog-review-upload');
  const course=await Course.create({teacherId:teacher.id,title:'Curso ficticio con imagen',level:'A1'});
  const imported=await catalog.importInitial(teacher);const product=`race-upload-${teacher.id}`;
  let reached,finish;const reachedUpload=new Promise(resolve=>{reached=resolve;});const upload=new Promise(resolve=>{finish=resolve;});
  jest.spyOn(cloudinary,'canUpload').mockReturnValue(true);
  jest.spyOn(cloudinary,'uploadFromBuffer').mockImplementation(()=>{reached();return upload;});
  const pending=request(app).put(`/api/courses/${course.id}`).set('Authorization',`Bearer ${teacher.token}`).field('title',course.title).field('hotmartProductId',product)
    .attach('image',Buffer.from('imagen ficticia'),{filename:'fake.png',contentType:'image/png'}).then(r=>r);
  await reachedUpload;
  const template=await catalog.create(teacher,{...fields(imported[0].current),templateKey:'race-upload',hotmartProductId:product});
  finish({secure_url:'https://fake.invalid/image.png'});
  const reply=await pending;
  expect(reply.status).toBe(409);expect(reply.body.code).toBe('hotmart_product_conflict');
  expect((await course.reload()).hotmartProductId).toBeNull();expect((await Version.findByPk(template.current.id)).hotmartProductId).toBe(product);
});

test('dos escrituras concurrentes comparten el mismo mutex entre curso y paquete', async()=>{
  const teacher=await createUser('teacher','catalog-review-concurrent');const imported=await catalog.importInitial(teacher);
  const course=await Course.create({teacherId:teacher.id,title:'Curso ficticio concurrente',level:'A1'});const product=`race-save-${teacher.id}`;
  const result=await Promise.allSettled([
    hotmart.saveCourseFields(course,{hotmartProductId:product,hotmartCheckoutUrl:'https://pay.hotmart.com/FAKE'}),
    catalog.create(teacher,{...fields(imported[0].current),templateKey:'race-save',hotmartProductId:product})
  ]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(result.find(r=>r.status==='rejected').reason.statusCode).toBe(409);
  const courseOwns=Boolean(await Course.findOne({where:{hotmartProductId:product}}));
  const packageOwns=Boolean(await Version.findOne({where:{hotmartProductId:product}}));expect(courseOwns&&packageOwns).toBe(false);
});

test('la activación rechaza condiciones comerciales distintas de la versión vista en la pestaña', async()=>{
  const teacher=await createUser('teacher','catalog-review-version');const imported=await catalog.importInitial(teacher);
  const old=await catalog.newVersion(teacher,imported[0].id,{...fields(imported[0].current),version:1,expectations:expectations(),hotmartProductId:`status-${teacher.id}`,hotmartOfferCode:'fake',hotmartCheckoutUrl:'https://pay.hotmart.com/FAKE'});
  const current=await catalog.newVersion(teacher,old.id,{...fields(old.current),version:old.current.version,priceAmount:9999});
  const activate=body=>request(app).patch(`/api/teacher/class-packages/${old.id}/status`).set('Authorization',`Bearer ${teacher.token}`).send(body);
  expect((await activate({status:'active',version:old.current.version})).status).toBe(409);
  expect((await activate({status:'active'})).status).toBe(400);
  const reply=await activate({status:'active',version:current.current.version});expect(reply.status).toBe(200);expect(reply.body.current.priceAmount).toBe(9999);
});
