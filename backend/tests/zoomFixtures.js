const request = require('supertest');
const app = require('../src/app');
const c = require('../src/services/zoomConnection');
async function connected(teacher) {
  const start = await c.connect(teacher); const agent = request.agent(app);
  const first = await agent.get(new URL(start.url).pathname + new URL(start.url).search);
  const url = new URL(first.headers.location);
  const callback = await agent.get(url.pathname + url.search);
  expect(callback.status).toBe(302); return { agent, url };
}
module.exports = { connected };
