// Detrás de un proxy inverso (en el VPS, el Caddy compartido) `req.ip` sería la IP del proxy y los límites por IP
// del chat (CHAT_IP_ACTIONS_PER_HOUR) contarían a todos los usuarios juntos. TRUST_PROXY es el número de saltos de
// proxy en los que se confía para leer X-Forwarded-For. Sin definir, o en 0, el encabezado se ignora: así sigue el
// desarrollo local, donde nadie debe poder falsear su IP.
//
// A propósito no se acepta `true`: confiaría en cualquier encabezado y cualquiera podría falsear su IP.

const MAX_HOPS = 5;

function parseTrustProxy(raw) {
  if (raw === undefined || raw === null) return false;
  const value = String(raw).trim().toLowerCase();
  if (value === '' || value === '0' || value === 'false') return false;
  if (!/^\d+$/.test(value) || Number(value) > MAX_HOPS) {
    throw new Error(
      `TRUST_PROXY inválido (${JSON.stringify(raw)}): usá el número de proxies de confianza, de 0 a ${MAX_HOPS} (en el VPS, 1).`
    );
  }
  return Number(value);
}

module.exports = { parseTrustProxy, MAX_HOPS };
