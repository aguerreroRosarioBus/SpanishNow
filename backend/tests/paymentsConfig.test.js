// PAYMENTS_FAKE can never be on in production (same rule as MEDIA_FAKE_UPLOADS).
const payments = require('../src/config/payments');

describe('payments configuration safety', () => {
  const keep = { ...process.env };
  afterEach(() => {
    for (const key of ['PAYMENTS_FAKE', 'NODE_ENV', 'RAILWAY_ENVIRONMENT', 'FRONTEND_URL']) {
      if (keep[key] === undefined) delete process.env[key]; else process.env[key] = keep[key];
    }
  });

  test('refuses PAYMENTS_FAKE=1 with NODE_ENV=production or on Railway', () => {
    process.env.PAYMENTS_FAKE = '1';
    process.env.NODE_ENV = 'production';
    expect(() => payments.assertSafe()).toThrow(/PAYMENTS_FAKE=1 is not allowed in production/);
    process.env.NODE_ENV = 'test';
    process.env.RAILWAY_ENVIRONMENT = 'production';
    expect(() => payments.assertSafe()).toThrow(/not allowed in production/);
  });

  test('is fine in development and when off in production', () => {
    process.env.PAYMENTS_FAKE = '1';
    expect(() => payments.assertSafe()).not.toThrow();
    process.env.PAYMENTS_FAKE = '0';
    process.env.NODE_ENV = 'production';
    expect(() => payments.assertSafe()).not.toThrow();
  });

  test('frontendUrl drops trailing slashes and is mandatory in production', () => {
    process.env.FRONTEND_URL = 'https://app.example.com//';
    expect(payments.frontendUrl()).toBe('https://app.example.com');
    delete process.env.FRONTEND_URL;
    process.env.NODE_ENV = 'production';
    expect(() => payments.frontendUrl()).toThrow(/FRONTEND_URL/);
  });
});
