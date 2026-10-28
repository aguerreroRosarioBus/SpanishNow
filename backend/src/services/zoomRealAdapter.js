const crypto = require('node:crypto');
const { fail } = require('./zoomAdapterCore');

const SCOPES = Object.freeze([
  'meeting:write:meeting',
  'meeting:update:meeting',
  'meeting:delete:meeting',
  'meeting:read:meeting',
  'meeting:read:list_meetings',
  'user:read:user',
  'user:read:settings'
]);
const MEETING_MARKER = 'SpanishNow correlation=';

function config() {
  const { ZOOM_CLIENT_ID: clientId, ZOOM_CLIENT_SECRET: clientSecret, ZOOM_REDIRECT_URI: redirectUri } = process.env;
  if (!clientId || !clientSecret || !redirectUri || !process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
    fail('provider_unavailable', 503, { reason: 'not_configured' });
  }
  return { clientId, clientSecret, redirectUri };
}

function createZoomRealAdapter({ oauthBaseUrl = 'https://zoom.us', apiBaseUrl = 'https://api.zoom.us/v2', fetchImpl = fetch } = {}) {
  const base = value => value.replace(/\/$/, '');
  const oauth = base(oauthBaseUrl);
  const api = base(apiBaseUrl);
  const basic = () => {
    const { clientId, clientSecret } = config();
    return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  };

  async function request(url, { method = 'GET', accessToken, json, form, allow = [], failure = 'api' } = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(['oauth', 'authorize', 'refresh'].includes(failure) ? { Authorization: basic() } : {}),
          ...(json ? { 'Content-Type': 'application/json' } : {}),
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
        },
        body: json ? JSON.stringify(json) : form ? new URLSearchParams(form) : undefined
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network';
      fail('zoom_provider_unavailable', 503, { reason }, { retryable: true });
    }

    let body = null;
    if (response.status !== 204) {
      try { body = await response.json(); } catch { body = null; }
    }
    if (response.ok || allow.includes(response.status)) return { response, body };

    const status = response.status;
    const oauthCode = typeof body?.error === 'string' ? body.error : '';
    if (failure === 'refresh' && (status === 400 || status === 401)) fail('zoom_revoked', 401, { reason: 'refresh_rejected' });
    if (failure === 'authorize' && (status === 400 || oauthCode === 'invalid_grant')) fail('zoom_oauth_invalid', 400);
    if (status === 401) fail('zoom_unauthorized', 401);
    if (status === 429) {
      const raw = response.headers.get('retry-after');
      const retryAfterSeconds = /^\d+$/.test(raw || '') ? Math.min(86400, Number(raw)) : undefined;
      fail('zoom_rate_limited', 429, retryAfterSeconds === undefined ? {} : { retryAfterSeconds }, { retryable: true });
    }
    if (status >= 500) fail('zoom_provider_unavailable', 503, { reason: 'upstream', status }, { retryable: true });
    if (status === 404 && failure === 'meeting') fail('zoom_meeting_missing', 404);
    fail('zoom_provider_unavailable', 502, { reason: 'upstream', status });
  }

  const parseToken = (body, previous = {}) => {
    if (!body?.access_token || !body?.refresh_token || !Number.isFinite(Number(body?.expires_in))) {
      fail('zoom_provider_unavailable', 502, { reason: 'invalid_token_response' });
    }
    return {
      ...previous,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(Date.now() + Math.max(1, Number(body.expires_in)) * 1000).toISOString(),
      scopes: typeof body.scope === 'string' ? body.scope : previous.scopes || null
    };
  };

  async function profile(accessToken) {
    const [{ body: user }, { body: settings }] = await Promise.all([
      request(`${api}/users/me`, { accessToken }),
      request(`${api}/users/me/settings`, { accessToken })
    ]);
    const type = Number(user?.type);
    const plan = type === 1 ? 'basic' : type === 2 ? 'licensed' : type === 4 ? 'unassigned' : 'unknown';
    const maxMinutes = plan === 'basic' ? 40 : plan === 'licensed' ? 1800 : 0;
    // Get user settings documenta feature.meeting_capacity; /users/me no es la fuente.
    // No inferir 100 plazas ni usar la capacidad de un add-on que podría estar desactivado.
    const rawCapacity = settings?.feature?.meeting_capacity;
    const capabilities = {
      plan, planType: Number.isFinite(type) ? type : null, maxMinutes,
      maxParticipants: Number.isSafeInteger(rawCapacity) && rawCapacity > 0 ? rawCapacity : null,
      participantCapacitySource: 'users/me/settings.feature.meeting_capacity',
      concurrentMeetings: 1,
      waitingRoom: settings?.in_meeting?.waiting_room === true,
      // Cada reunión enviada por SpanishNow recibe una contraseña aleatoria, además de la política de Zoom.
      passcodeRequired: true
    };
    if (!user?.id || !user?.account_id || !user?.email || !Number.isFinite(type)) {
      fail('zoom_capacity_unknown');
    }
    return { accountId: user.account_id, userId: user.id, email: user.email, capabilities };
  }

  function normalize(meeting) {
    if (!meeting) return null;
    return {
      id: String(meeting.id), joinUrl: meeting.join_url,
      correlationKey: typeof meeting.agenda === 'string' && meeting.agenda.startsWith(MEETING_MARKER)
        ? meeting.agenda.slice(MEETING_MARKER.length) : null,
      waitingRoom: meeting.settings ? meeting.settings.waiting_room === true : undefined
    };
  }

  function meetingPayload(wanted, { includePassword = true } = {}) {
    const correlationKey = String(wanted.correlationKey || '');
    if (!correlationKey || correlationKey.length > 180 || !Number.isFinite(Number(wanted.minutes)) || Number(wanted.minutes) < 1) {
      fail('validation_failed', 400);
    }
    const startsAt = new Date(wanted.startsAt);
    if (!Number.isFinite(startsAt.getTime())) fail('validation_failed', 400);
    return {
      topic: 'SpanishNow: clase', type: 2, start_time: startsAt.toISOString(), duration: Math.trunc(Number(wanted.minutes)),
      timezone: 'UTC', agenda: `${MEETING_MARKER}${correlationKey}`,
      ...(includePassword ? { password: crypto.randomBytes(5).toString('hex') } : {}),
      settings: { waiting_room: true, join_before_host: false, auto_recording: 'none' }
    };
  }

  async function listPage(accessToken, pageToken) {
    const url = new URL(`${api}/users/me/meetings`);
    url.searchParams.set('type', 'scheduled'); url.searchParams.set('page_size', '300');
    if (pageToken) url.searchParams.set('next_page_token', pageToken);
    return (await request(url, { accessToken })).body;
  }

  async function getMeeting(accessToken, meetingId) {
    const result = await request(`${api}/meetings/${encodeURIComponent(String(meetingId))}`, { accessToken, failure: 'meeting' });
    return result.body;
  }

  return {
    scopes: SCOPES,
    authorizeUrl({ state, challenge }) {
      const { clientId, redirectUri } = config();
      const url = new URL(`${oauth}/oauth/authorize`);
      url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
        scope: SCOPES.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
      return url.href;
    },
    async authorize({ code, verifier }) {
      const { redirectUri } = config();
      const result = await request(`${oauth}/oauth/token`, { method: 'POST', failure: 'authorize', form: {
        grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier
      } });
      const tokens = parseToken(result.body);
      try {
        const info = await profile(tokens.accessToken);
        const granted = String(tokens.scopes || '').split(/\s+/).filter(Boolean);
        if (!SCOPES.every(scope => granted.includes(scope))) fail('zoom_oauth_scopes_missing', 400);
        return { ...tokens, ...info };
      } catch (error) {
        await request(`${oauth}/oauth/revoke`, { method: 'POST', failure: 'oauth', form: { token: tokens.accessToken } }).catch(() => {});
        throw error;
      }
    },
    async refresh(tokens) {
      const result = await request(`${oauth}/oauth/token`, { method: 'POST', failure: 'refresh', form: {
        grant_type: 'refresh_token', refresh_token: tokens.refreshToken
      } });
      return parseToken(result.body, tokens);
    },
    async revoke(accessToken) {
      await request(`${oauth}/oauth/revoke`, { method: 'POST', failure: 'oauth', form: { token: accessToken } });
    },
    async capabilities(tokens) {
      const info = await profile(tokens.accessToken);
      return info.capabilities;
    },
    async find(tokens, correlationKey) {
      let pageToken;
      let pages = 0;
      do {
        const page = await listPage(tokens.accessToken, pageToken);
        const match = (page?.meetings || []).find(meeting => meeting.agenda === `${MEETING_MARKER}${correlationKey}`);
        if (match) return normalize(match);
        pageToken = page?.next_page_token || null;
        pages += 1;
      } while (pageToken && pages < 100);
      return null;
    },
    async create(tokens, wanted) {
      const result = await request(`${api}/users/me/meetings`, { method: 'POST', accessToken: tokens.accessToken, json: meetingPayload(wanted) });
      let meeting = normalize(result.body);
      if (!meeting?.id || !meeting.joinUrl) fail('zoom_provider_unavailable', 502, { reason: 'invalid_meeting_response' });
      // Si la respuesta de creación no trae settings, se consulta la reunión para confirmar la sala de espera.
      if (meeting.waitingRoom === undefined) meeting = { ...meeting, waitingRoom: normalize(await getMeeting(tokens.accessToken, meeting.id)).waitingRoom === true };
      return meeting;
    },
    async update(tokens, meetingId, wanted) {
      await request(`${api}/meetings/${encodeURIComponent(String(meetingId))}`, {
        method: 'PATCH', accessToken: tokens.accessToken, json: meetingPayload(wanted, { includePassword: false }), failure: 'meeting'
      });
      return normalize(await getMeeting(tokens.accessToken, meetingId));
    },
    async remove(tokens, meetingId) {
      await request(`${api}/meetings/${encodeURIComponent(String(meetingId))}`, {
        method: 'DELETE', accessToken: tokens.accessToken, failure: 'meeting', allow: [404]
      });
    },
    async host(tokens, meetingId) {
      const meeting = await getMeeting(tokens.accessToken, meetingId);
      let url;
      try { url = new URL(meeting?.start_url); } catch { fail('zoom_provider_unavailable', 502, { reason: 'host_url_missing' }); }
      if (url.protocol !== 'https:' || (url.hostname !== 'zoom.us' && !url.hostname.endsWith('.zoom.us')) || url.username || url.password) {
        fail('zoom_provider_unavailable', 502, { reason: 'host_url_invalid' });
      }
      return url.href;
    }
  };
}

module.exports = { ...createZoomRealAdapter(), createZoomRealAdapter, SCOPES };
