const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const time = require('../src/domain/classTime');
const fixtures = require('../../docs/clases-chat-integraciones/fixtures/time.json');
const zone = 'America/New_York';
const cordoba = 'America/Argentina/Cordoba';
const intent = (patch = {}) => ({ localStart: '2026-10-22T09:00', timeZone: zone, offset: '-04:00', minutes: 50, ...patch });
function failure(callback, code) {
  try { callback(); } catch (error) {
    expect(error).toBeInstanceOf(time.TimeError);
    expect(error).toMatchObject({ statusCode: 400, code });
    return error.params;
  }
  throw new Error(`Se esperaba ${code}`);
}

describe('W06: intención local y UTC de CONTRATO §1.2–1.3', () => {
  test('el artefacto backend corresponde a la fuente única actual', () => {
    const source = readFileSync(path.resolve(__dirname, '../../frontend/src/app/core/time/class-time.ts'), 'utf8');
    const fingerprint = createHash('sha256').update(source).digest('hex');
    expect(readFileSync(require.resolve('../src/domain/classTime'), 'utf8')).toContain(`// Fuente SHA256: ${fingerprint}\n`);
  });

  test.each(fixtures.conversions)('$id: instante independiente del host y proyección a otras zonas', fixture => {
    const { localStart, timeZone, offset } = fixture;
    const result = time.resolveLocalIntent({ localStart, timeZone, offset, minutes: 50 });
    expect(result).toMatchObject({ localStart, startsAt: fixture.startsAt, utcOffset: offset, disambiguation: 'none', timeZone });
    expect(result.endsAt).toBe(time.addElapsed(fixture.startsAt, { minutes: 50 }));
    if (fixture.cordoba) expect(time.inTimeZone(result.startsAt, cordoba).localStart).toBe(fixture.cordoba);
    if (fixture.london) expect(time.inTimeZone(result.startsAt, 'Europe/London').localStart).toBe(fixture.london);
  });

  test('TZ-T04: hora inexistente siempre se rechaza y ofrece alternativas que se pueden reenviar', () => {
    const { alternatives, ...input } = fixtures.gap;
    for (const disambiguation of [undefined, 'earlier', 'later']) {
      expect(failure(() => time.resolveLocalIntent({ ...input, disambiguation }), 'local_time_nonexistent'))
        .toEqual({ alternatives });
    }
    for (const { startsAt, ...alternative } of alternatives) {
      expect(time.resolveLocalIntent({ ...alternative, minutes: 50 }).startsAt).toBe(startsAt);
    }
  });

  test('TZ-T05: offset solo no resuelve ambigüedad; la elección explícita conserva su instante', () => {
    const { options, ...input } = fixtures.fold;
    expect(failure(() => time.resolveLocalIntent({ ...input, offset: '-04:00' }), 'local_time_ambiguous')).toEqual({ options });
    options.forEach((option, index) => {
      const disambiguation = index ? 'later' : 'earlier';
      const result = time.resolveLocalIntent({ ...input, offset: option.offset, disambiguation });
      expect(result).toMatchObject({ startsAt: option.startsAt, utcOffset: option.offset, disambiguation });
    });
    failure(() => time.resolveLocalIntent({ ...input, offset: '-04:00', disambiguation: 'later' }), 'offset_mismatch');
  });

  test('DST de 30 minutos y fecha omitida de Samoa: no supone saltos de una hora', () => {
    const gap = { localStart: '2026-10-04T02:15', timeZone: 'Australia/Lord_Howe', offset: '+10:30', minutes: 30 };
    const { alternatives } = failure(() => time.resolveLocalIntent(gap), 'local_time_nonexistent');
    expect(alternatives.map(x => x.localStart)).toEqual(['2026-10-04T01:45', '2026-10-04T02:45']);
    failure(() => time.resolveLocalIntent({ ...gap, localStart: '2011-12-30T12:00', timeZone: 'Pacific/Apia', offset: '-10:00' }), 'local_time_nonexistent');
  });

  test('TZ-T08: no acepta UTC suministrado por cliente ni offset incompatible', () => {
    expect(failure(() => time.resolveLocalIntent(intent({ offset: '-05:00' })), 'offset_mismatch'))
      .toEqual({ expectedOffset: '-04:00', receivedOffset: '-05:00' });
    failure(() => time.resolveLocalIntent(intent({ startsAt: '2026-10-22T14:00:00Z' })), 'validation_failed');
    failure(() => time.resolveLocalIntent(intent({ offset: undefined })), 'validation_failed');
  });

  test.each(['UTC', cordoba, zone, 'Europe/London', 'Asia/Kolkata', 'Asia/Calcutta', 'Asia/Katmandu', 'US/Eastern'])('IANA y alias: %s', name => {
    expect(time.isTimeZone(name)).toBe(true);
  });
  test.each(['EST', 'CST', 'GMT', 'UTC-3', '-03:00', 'Argentina', 'America/Inventada', '', ' Europe/London', null, 3])('zona inválida: %s', name => {
    expect(time.isTimeZone(name)).toBe(false);
    failure(() => time.resolveLocalIntent(intent({ timeZone: name })), 'time_zone_invalid');
  });

  test.each([
    { localStart: '2026-02-30T09:00' }, { localStart: '2026-10-22T24:00' },
    { localStart: '2026-10-22T09:00Z' }, { localStart: '2026-10-22T09:00:60' },
    { localStart: '2026-10-22T09:00:00.0001' }, { localStart: '2026-10-22T09:00[UTC]' },
    { localStart: '2026-10-22T09:00:00' }, { disambiguation: null },
    { disambiguation: 'compatible' }, { minutes: 0 }, { minutes: -1 }, { minutes: 1.5 }, { minutes: 65536 },
    { minutes: '50' }, { minutes: Infinity }, { offset: 'EST' }, { offset: '-24:00' }
  ])('rechaza datos sin normalizarlos silenciosamente: %j', patch => {
    failure(() => time.resolveLocalIntent(intent(patch)), 'validation_failed');
  });

  test('normaliza instantes explícitos con ms; rechaza fecha sin zona, overflow y pérdida de precisión', () => {
    expect(time.normalizeInstant('2026-10-22T09:00:00-04:00')).toBe('2026-10-22T13:00:00.000Z');
    expect(time.normalizeInstant('2026-10-22T13:00:00.123Z')).toBe('2026-10-22T13:00:00.123Z');
    failure(() => time.normalizeInstant('2026-10-22T09:00'), 'time_without_zone');
    for (const value of ['2026-02-30T09:00:00Z', '2026-10-22', '2026-10-22T09:00:60Z', '2026-10-22T09:00:00.0001Z', '2026-10-22T09:00:00Z[UTC]', 0, new Date()]) {
      failure(() => time.normalizeInstant(value), 'validation_failed');
    }
  });

  test('errores compatibles con el middleware HTTP existente, con alternativas estructuradas', () => {
    const { errorHandler } = require('../src/middlewares/error.middleware');
    const { alternatives, ...input } = fixtures.gap;
    let error;
    try { time.resolveLocalIntent(input); } catch (caught) { error = caught; }
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      errorHandler(error, {}, res, () => {});
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: error.message, code: 'local_time_nonexistent', params: { alternatives } });
    } finally { log.mockRestore(); }
  });
});

describe('W06: presentación, plazos e intervalos', () => {
  test('TZ-T06/T07: ambas fechas, zonas y offsets; cambiar idioma/zona no cambia la sesión', () => {
    const session = Object.freeze({ startsAt: '2026-10-23T02:30:00.000Z', endsAt: '2026-10-23T03:20:00.000Z' });
    const es = time.presentSessionTime(session, cordoba, 'Europe/London', 'es');
    expect(es.recipient.start).toMatchObject({ localStart: '2026-10-22T23:30:00.000', offset: '-03:00', timeZone: cordoba });
    expect(es.teacher.start).toMatchObject({ localStart: '2026-10-23T03:30:00.000', offset: '+01:00' });
    expect(es.differentDates).toBe(true);
    const en = time.presentSessionTime(session, 'Europe/London', zone, 'en');
    expect(en.recipient.start.startsAt).toBe(es.recipient.start.startsAt);
    expect(en.recipient.end.startsAt).toBe(es.recipient.end.startsAt);
    expect(en.recipient.startLabel).not.toBe(es.recipient.startLabel);
    expect(time.presentSessionTime(session, cordoba, cordoba, 'es').differentDates).toBe(false);
  });

  test('duración de la sesión se mide en instantes incluso cuando el reloj retrocede', () => {
    const result = time.resolveLocalIntent({ ...intent(), localStart: '2026-11-01T01:30', disambiguation: 'earlier' });
    expect(result.endsAt).toBe('2026-11-01T06:20:00.000Z');
    const view = time.presentSessionTime(result, zone, zone, 'en');
    expect(view.recipient.start.offset).toBe('-04:00');
    expect(view.recipient.end.offset).toBe('-05:00');
    expect(view.recipient.end.localStart).toBe('2026-11-01T01:20:00.000');
  });

  test.each(['2026-10-22T13:00:00Z', '2027-03-14T13:00:00Z', '2026-11-01T14:00:00Z'])('TZ-T09: 24 h exactas incluidas y 1 s después tardío (%s)', startsAt => {
    const now = time.addElapsed(startsAt, { hours: -24 });
    expect(time.isAtLeastHoursBefore(startsAt, now, 24)).toBe(true);
    expect(time.isAtLeastHoursBefore(startsAt, time.addElapsed(now, { seconds: 1 }), 24)).toBe(false);
  });

  test('90 días son 2160 horas reales y no 90 días de pared; no hay unidad días implícita', () => {
    expect(time.addElapsed('2026-10-22T13:00:00Z', { hours: 2160 })).toBe('2027-01-20T13:00:00.000Z');
    failure(() => time.addElapsed('2026-10-22T13:00:00Z', { days: 90 }), 'validation_failed');
    failure(() => time.addElapsed('2026-10-22T13:00:00Z', { hours: 1.5 }), 'validation_failed');
  });

  test('AGENDA-04: extremos adyacentes no chocan, buffer exacto permitido y simetría', () => {
    const a = { startsAt: '2026-10-22T13:00:00Z', endsAt: '2026-10-22T13:50:00Z' };
    const adjacent = { startsAt: a.endsAt, endsAt: '2026-10-22T14:40:00Z' };
    const separated = { startsAt: '2026-10-22T14:00:00Z', endsAt: '2026-10-22T14:50:00Z' };
    expect(time.intervalsConflict(a, adjacent)).toBe(false);
    expect(time.intervalsConflict(a, adjacent, 10)).toBe(true);
    expect(time.intervalsConflict(a, separated, 10)).toBe(false);
    expect(time.intervalsConflict(a, { ...separated, startsAt: '2026-10-22T13:59:59Z' }, 10)).toBe(true);
    expect(time.intervalsConflict(a, a)).toBe(true);
    for (const b of [adjacent, separated, a]) expect(time.intervalsConflict(a, b, 10)).toBe(time.intervalsConflict(b, a, 10));
    failure(() => time.intervalsConflict({ startsAt: a.startsAt, endsAt: a.startsAt }, a), 'validation_failed');
    failure(() => time.intervalsConflict(a, adjacent, -1), 'validation_failed');
  });

  test('TZ-T10: procesos en UTC, Tokio y Los Ángeles producen el mismo resultado', () => {
    const script = `const t = require(${JSON.stringify(require.resolve('../src/domain/classTime'))});
      process.stdout.write(JSON.stringify({ session: t.resolveLocalIntent(${JSON.stringify(intent())}),
        deadline: t.isAtLeastHoursBefore('2027-03-14T13:00:00Z', '2027-03-13T13:00:00Z', 24) }));`;
    const results = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles'].map(TZ => execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }));
    expect(new Set(results).size).toBe(1);
    expect(JSON.parse(results[0]).session.startsAt).toBe(fixtures.conversions[0].startsAt);
  });
});
