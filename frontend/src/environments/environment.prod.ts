// URL relativa, como la configuración `lan`: la web y la API comparten dominio. En el VPS el Caddy compartido
// envía /api al backend (deploy/spanishnow.caddy) y el resto a la web (DEP-02).
export const environment = {
  production: true,
  apiUrl: '/api'
};
