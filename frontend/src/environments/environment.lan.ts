// Relative URL: `ng serve --configuration lan` proxies /api to the local backend (proxy.lan.json),
// so phones and other devices on the Wi-Fi reach the API through the same host as the page.
// The lan server runs on HTTPS (self-signed) because microphone, clipboard and crypto.randomUUID
// only work in secure contexts, and http://192.168.x.x is not one.
export const environment = {
  production: false,
  apiUrl: '/api'
};
