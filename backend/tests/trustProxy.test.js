// DEP-03 / AC-DEP-03: detrás del proxy del VPS, req.ip es la IP del cliente solo si TRUST_PROXY lo pide.
const express = require('express');
const request = require('supertest');
const { parseTrustProxy } = require('../src/config/trustProxy');

function appWith(raw) {
  const app = express();
  app.set('trust proxy', parseTrustProxy(raw));
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe('parseTrustProxy', () => {
  test.each([[undefined], [null], [''], ['0'], ['false'], [' FALSE ']])('%p no confía en ningún proxy', (raw) => {
    expect(parseTrustProxy(raw)).toBe(false);
  });

  test.each([['1', 1], ['2', 2], [' 3 ', 3]])('%p confía en %i salto(s)', (raw, hops) => {
    expect(parseTrustProxy(raw)).toBe(hops);
  });

  test.each([['true'], ['yes'], ['-1'], ['1.5'], ['10.0.0.1'], ['loopback'], ['6']])('%p se rechaza al arrancar', (raw) => {
    expect(() => parseTrustProxy(raw)).toThrow(/TRUST_PROXY inválido/);
  });
});

describe('req.ip detrás de un proxy', () => {
  test('sin TRUST_PROXY se ignora X-Forwarded-For (no se puede falsear la IP)', async () => {
    const res = await request(appWith(undefined)).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).not.toBe('203.0.113.9');
  });

  test('con TRUST_PROXY=1 se usa la IP que informó el proxy', async () => {
    const res = await request(appWith('1')).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });

  test('con TRUST_PROXY=1 una IP falsa puesta por el cliente no gana: cuenta la que agregó el proxy', async () => {
    // El cliente envía «198.51.100.7»; el proxy le suma la IP real al final de la cadena.
    const res = await request(appWith('1')).get('/ip').set('X-Forwarded-For', '198.51.100.7, 203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });
});

describe('cableado en la aplicación', () => {
  const load = (value) => {
    const previous = process.env.TRUST_PROXY;
    if (value === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = value;
    let app;
    jest.isolateModules(() => { app = require('../src/app'); });
    if (previous === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previous;
    return app;
  };

  test('la aplicación lee TRUST_PROXY y por defecto no confía en proxies', () => {
    expect(load(undefined).get('trust proxy')).toBe(false);
    expect(load('1').get('trust proxy')).toBe(1);
  });

  test('un valor inválido impide arrancar', () => {
    expect(() => load('true')).toThrow(/TRUST_PROXY inválido/);
  });
});
