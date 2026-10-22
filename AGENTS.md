# Instrucciones para agentes (Claude Code y Codex)

En este repositorio trabajan dos agentes que se turnan según su cupo de uso. Antes de cualquier tarea de clases, chat, paquetes, agenda, Calendar, Zoom, I18N, legal o audio:

1. Leer [docs/clases-chat-integraciones/SPEC.md](docs/clases-chat-integraciones/SPEC.md) (qué construir) y [COORDINACION.md](docs/clases-chat-integraciones/COORDINACION.md) (orquestación, reparto y relevo).
2. Leer el issue «Orquestación» en GitHub y el issue del paquete `Wxx`. Si te piden orquestar y Claude no está activo, asumí la orquestación como indica COORDINACION.md.
3. Trabajar en un solo paquete, en la rama `wxx-<tema>` desde `main` actualizado y en un worktree propio. Si la rama ya existe, retomá desde su último commit y el último comentario «Relevo».
4. Podés quedarte sin uso en cualquier momento: commit y push de cada paso con pruebas verdes, y checklist del issue al día. Si llegás a tiempo, dejá un comentario «Relevo».
5. No revertir ni reescribir cambios del otro agente. Superficies compartidas: solo cambios aditivos mínimos, declarados en el PR.
6. No cambiar decisiones de producto (D01–D09) ni reglas de zonas horarias o de dinero por tu cuenta: proponelas en «Decisiones pendientes».
7. Nada de producción: sin cobros, mensajes, correos ni cuentas reales; proveedores siempre por adaptador fake o sandbox.
8. Cada PR usa el formato de entrega de SPEC §14.3 y lista los IDs de requisitos y criterios AC que cubre, con las pruebas ejecutadas y su resultado.

Convenciones generales del proyecto: [DEVELOPMENT.md](DEVELOPMENT.md) y [backend/docs/database.md](backend/docs/database.md). Textos, commits y PR en español.
