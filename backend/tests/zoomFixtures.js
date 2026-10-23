const request = require('supertest');
const app = require('../src/app');
const c = require('../src/services/zoomConnection');
const { as } = require('./helpers/fixtures');
async function connected(teacher) {
  const start = await c.connect(teacher); const agent = request.agent(app);
  const url = new URL(start.url);
  const callback = await agent.get(url.pathname + url.search);
  expect(callback.status).toBe(302);
  const token = new URL(callback.headers.location).searchParams.get('token');
  expect((await as(teacher).post('/api/integrations/zoom/complete').send({ token })).status).toBe(200);
  return { agent, url };
}
module.exports = { connected };
