// Relative URL: `ng serve --configuration lan` proxies /api to the local backend (proxy.lan.json),
// so phones and other devices on the Wi-Fi reach the API through the same host as the page.
export const environment = {
  production: false,
  apiUrl: '/api'
};
