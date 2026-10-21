// Helpers for the course-selling suites.
const request = require('supertest');
const { randomUUID } = require('crypto');
const { app } = require('./fixtures');
const { Course } = require('../../src/models');
const { getOutbox } = require('../../src/services/mailService');

/** Publishes the world's course with a price and a unique slug. */
async function publish(course, { price = 1999, currency = 'usd' } = {}) {
  await course.update({ isPublished: true, price, currency, slug: `curso-${randomUUID().slice(0, 8)}`, salesDescription: 'Learn Spanish with a short film.' });
  return course;
}

async function newCourse(teacher, values = {}) {
  return Course.create({ title: `Curso ${randomUUID().slice(0, 6)}`, description: 'Descripción', level: 'A1', teacherId: teacher.id, ...values });
}

/** Multipart upload of a CSV (Buffer or string) with the teacher's token. */
const upload = (teacher, url, csv, fields = {}) => {
  let req = request(app).post(url);
  if (teacher) req = req.set('Authorization', `Bearer ${teacher.token}`);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
  return req.attach('file', Buffer.isBuffer(csv) ? csv : Buffer.from(csv), { filename: 'hotmart.csv', contentType: 'text/csv' });
};

/** Emails sent to an address, newest last. */
const mailsTo = email => getOutbox().filter(message => message.to === email);

/** Polls until `check()` returns something truthy (for work done after the response). */
async function waitFor(check, { timeout = 3000 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

/** Token of the first link in an email: .../reset-password?token=XXX */
const tokenFromMail = message => decodeURIComponent(/token=([^&\s"]+)/.exec(message.text)[1]);

module.exports = { publish, newCourse, upload, mailsTo, waitFor, tokenFromMail };
