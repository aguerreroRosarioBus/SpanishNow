# W01 — Ventas y órdenes del docente

I18N-02/03/04/05/06 y AC17. Ventas/órdenes EN/ES: períodos, filtros, tablas, gráfico accesible, estados, errores, avisos y confirmación de reembolso manual. Datos originales y monedas permanecen separados. No cambia el período consultado, cálculo, reglas de reembolso ni acceso.

monthLabel recibe locale opcional (español por defecto), presenta un mes calendario sin desplazarlo por zona. Las marcas del eje se redondean solo para mostrar unidades menores enteras; no altera ticks, barras ni importes. Fechas de órdenes en zona de cuenta/dispositivo, independiente del idioma. La confirmación no reenvía el reembolso al alternar idioma y conserva revokeAccess/filtro/destinatario.

Superficie compartida: registro aditivo teacherCommerce.* en EN/ES. Sin API, migraciones, configuración o decisiones nuevas. CSV conserva su contrato/tablas de datos; no se ejecutó exportación ni reembolso real. Errores se conservan como código/dato y se traducen al mostrar; no exponen excepciones arbitrarias.

Pruebas: 373/373 unitarias frontend, 4/4 E2E escritorio/móvil con API ficticia y externos bloqueados, build producción, tsc E2E y diff check verdes. Incluye un gráfico de un centavo para verificar etiquetas del eje sin errores. Advertencias Sass/budgets conocidas.

Manual ficticio: alternar idioma en ventas con varias monedas, comparar valores/meses/período; abrir reembolso de una orden ficticia, cambiar revokeAccess y filtro, alternar sin confirmar. Revertir commit, sin datos/migraciones que revertir.
