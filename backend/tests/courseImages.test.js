jest.mock('../src/models', () => ({
  Course: { findByPk: jest.fn(), create: jest.fn() },
  Unit: { findByPk: jest.fn() }, Vocabulary: { create: jest.fn(), findByPk: jest.fn() }
}));
jest.mock('../src/config/cloudinary', () => ({ canUpload: jest.fn(), uploadFromBuffer: jest.fn() }));
jest.mock('../src/services/quizService', () => ({}));
jest.mock('../src/services/commentService', () => ({}));
jest.mock('../src/middlewares/auth.middleware', () => ({
  authMiddleware: (req, res, next) => { req.user = { id: Number(req.headers['x-user'] || 7), role: 'teacher' }; next(); },
  optionalAuth: (req, res, next) => next(), isTeacher: (req, res, next) => next()
}));
const express = require('express');
const request = require('supertest');
const { Course, Unit, Vocabulary } = require('../src/models');
const cloudinary = require('../src/config/cloudinary');
const app = express(); app.use(express.json());
app.use('/courses', require('../src/routes/course.routes'));
app.use('/vocabulary', require('../src/routes/vocabulary.routes'));
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const URL = 'https://cdn.example.com/saved.png';
let course;
beforeEach(() => {
  jest.clearAllMocks();
  course = { id: 1, teacherId: 7, imageUrl: 'https://cdn.example.com/old.png', nextCourseId: null, nextCourseCouponId: null };
  course.update = jest.fn(async values => Object.assign(course, values));
  Course.findByPk.mockResolvedValue(course); Course.create.mockImplementation(async values => ({ id: 1, ...values }));
  Unit.findByPk.mockResolvedValue({ id: 2, course }); Vocabulary.create.mockImplementation(async values => ({ id: 3, ...values }));
  Vocabulary.findByPk.mockResolvedValue({ id: 3, unit: { course }, update: jest.fn() });
  cloudinary.canUpload.mockReturnValue(true); cloudinary.uploadFromBuffer.mockResolvedValue({ secure_url: URL });
});
const cover = (req) => req.attach('image', PNG, { filename: 'google-image.png', contentType: 'image/png' });
test('creating a course persists the selected image from its in-memory buffer', async () => {
  const res = await cover(request(app).post('/courses').field('title', 'Mi curso').field('level', 'A1'));
  expect(res.status).toBe(201); expect(res.body.imageUrl).toBe(URL);
  expect(cloudinary.uploadFromBuffer).toHaveBeenCalledWith(PNG, { folder: 'spanishnow/courses', resource_type: 'image' });
});
test('replacing a cover preserves sales, video and series fields sent as multipart', async () => {
  const res = await cover(request(app).put('/courses/1').field('title', 'Mi curso').field('price', '2500').field('currency', 'usd').field('isPublished', 'true').field('introVideoUrl', '').field('nextCourseId', '').field('nextCourseCouponId', ''));
  expect(res.status).toBe(200);
  expect(course.update).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: URL, price: 2500, currency: 'usd', isPublished: true, introVideoUrl: null, nextCourseId: null, nextCourseCouponId: null }));
  expect(cloudinary.uploadFromBuffer.mock.calls[0][0]).toEqual(PNG);
});
test('other teachers cannot replace a cover; invalid sales data uploads nothing', async () => {
  expect((await cover(request(app).put('/courses/1').set('x-user', '8'))).status).toBe(403);
  expect((await cover(request(app).put('/courses/1').field('price', '-1'))).status).toBe(400);
  expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled(); expect(course.update).not.toHaveBeenCalled();
});
test('unconfigured storage and failed uploads cannot silently discard course images', async () => {
  cloudinary.canUpload.mockReturnValue(false);
  expect((await cover(request(app).post('/courses').field('title', 'Curso'))).status).toBe(503);
  cloudinary.canUpload.mockReturnValue(true); cloudinary.uploadFromBuffer.mockRejectedValue(new Error('provider private error'));
  expect((await cover(request(app).put('/courses/1'))).status).toBe(502);
  expect(Course.create).not.toHaveBeenCalled(); expect(course.update).not.toHaveBeenCalled();
});
test('creating vocabulary persists its selected image and fails clearly if storage is missing', async () => {
  let res = await cover(request(app).post('/vocabulary').field('unitId', '2').field('word', 'casa').field('translation', 'house'));
  expect(res.status).toBe(201); expect(res.body.imageUrl).toBe(URL);
  cloudinary.canUpload.mockReturnValue(false); Vocabulary.create.mockClear();
  res = await cover(request(app).post('/vocabulary').field('unitId', '2').field('word', 'casa').field('translation', 'house'));
  expect(res.status).toBe(503); expect(Vocabulary.create).not.toHaveBeenCalled();
});
