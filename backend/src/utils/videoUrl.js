// Video links: we do not host video, the teacher pastes a link and the player embeds it.
// normalizeVideoUrl() accepts the usual share/watch/embed links of YouTube, Vimeo and Bunny Stream and returns the
// embed URL the player puts in an iframe. Any other host (or a malformed link) returns null.
//
//   YouTube  https://www.youtube-nocookie.com/embed/ID
//   Vimeo    https://player.vimeo.com/video/ID            (+ ?h=HASH for unlisted videos)
//   Bunny    https://iframe.mediadelivery.net/embed/LIBRARY/ID

const MAX_LENGTH = 500;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;
const BUNNY_HOSTS = new Set(['iframe.mediadelivery.net', 'player.mediadelivery.net']);
const BUNNY_LIBRARY = /^\d{1,10}$/;
const BUNNY_VIDEO = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function youtube(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (url.hostname === 'youtu.be') id = parts[0];
  else if (parts[0] === 'watch') id = url.searchParams.get('v');
  else if (['embed', 'shorts', 'live', 'v'].includes(parts[0]) && parts.length === 2) id = parts[1];
  return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

function vimeo(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  let id = null;
  let hash = url.searchParams.get('h');
  if (url.hostname === 'player.vimeo.com') {
    if (parts[0] !== 'video' || parts.length !== 2) return null;
    id = parts[1];
  } else {
    // vimeo.com/ID, vimeo.com/ID/HASH (unlisted), vimeo.com/channels/NAME/ID, vimeo.com/groups/NAME/videos/ID
    const numeric = parts.findIndex(part => VIMEO_ID.test(part));
    if (numeric === -1) return null;
    const before = parts.slice(0, numeric);
    const okPrefix = before.length === 0 ||
      (before.length === 2 && before[0] === 'channels') ||
      (before.length === 3 && before[0] === 'groups' && before[2] === 'videos');
    if (!okPrefix) return null;
    id = parts[numeric];
    const after = parts.slice(numeric + 1);
    if (after.length > 1) return null;
    if (after.length === 1) hash = after[0];
  }
  if (!VIMEO_ID.test(id)) return null;
  if (hash && !VIMEO_HASH.test(hash)) return null;
  return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash.toLowerCase()}` : ''}`;
}

function bunny(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 3 || !['embed', 'play'].includes(parts[0])) return null;
  const [, library, video] = parts;
  return BUNNY_LIBRARY.test(library) && BUNNY_VIDEO.test(video)
    ? `https://iframe.mediadelivery.net/embed/${library}/${video.toLowerCase()}`
    : null;
}

/** Embed URL for a supported video link, or null when the link is not from YouTube, Vimeo or Bunny (or is malformed). */
function normalizeVideoUrl(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || text.length > MAX_LENGTH) return null;
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host) || host === 'youtu.be') return youtube({ hostname: host, pathname: url.pathname, searchParams: url.searchParams });
  if (VIMEO_HOSTS.has(host)) return vimeo({ hostname: host, pathname: url.pathname, searchParams: url.searchParams });
  if (BUNNY_HOSTS.has(host)) return bunny(url);
  return null;
}

const INVALID_MESSAGE = 'Video link not supported: use a YouTube, Vimeo or Bunny Stream link';

/**
 * Reads an optional video field of a request body (JSON or multipart).
 * `undefined` leaves the field untouched, `null` or an empty string clears it, anything else must be a supported link.
 * Returns { skip: true } | { value } | { error }.
 */
function parseVideoField(body, key) {
  const raw = body ? body[key] : undefined;
  if (raw === undefined) return { skip: true };
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) return { value: null };
  const value = normalizeVideoUrl(raw);
  return value ? { value } : { error: INVALID_MESSAGE };
}

module.exports = { normalizeVideoUrl, parseVideoField, INVALID_MESSAGE };
