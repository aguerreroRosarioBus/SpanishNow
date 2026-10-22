# Coordinación Claude + Codex

Cómo implementar la [guía de clases, chat e integraciones](SPEC.md) con dos agentes, **Claude Code** y **Codex**, que tienen límites de uso (5 h y semanales). La guía manda sobre el *qué*; este archivo fija *cómo se reparte, se entrega y se releva* el trabajo. Las reglas para ambos agentes están en [AGENTS.md](../../AGENTS.md).

Principio: **ningún estado vive en la cabeza de un agente.** Todo lo necesario para continuar está en GitHub (issues, ramas, PR) y en este repositorio, de modo que cualquiera de los dos pueda retomar en cualquier momento.

## Roles

| Rol | Quién | Responsabilidad |
| --- | --- | --- |
| Dueño de producto | Andrés | Decide, indica qué agente tiene cupo, aprueba PR y hace merge. Único que cambia decisiones D01–D09. |
| Orquestador | Claude; **Codex lo releva** cuando Claude se queda sin uso | Elige el próximo paquete, mantiene el issue «Orquestación», el contrato W00 y las superficies compartidas (SPEC §14.1.3). |
| Implementador | El agente con cupo | Toma un paquete disponible y lo lleva a PR. El orquestador también puede implementar. |
| Revisor cruzado | El otro agente, si tiene cupo | Revisa el PR contra los IDs de requisitos citados. Si no hay cupo, Andrés decide si mergea sin revisión cruzada. |

## Dónde está el estado

- **Issue «Orquestación»** (fijado): bitácora del orquestador. Quién orquesta ahora, qué paquetes están en curso, decisiones tomadas y próximo paso sugerido. Se actualiza en cada cambio, no al final.
- **Un issue por paquete `Wxx`** con checklist de su alcance y etiquetas:
  - estado: `estado:disponible`, `estado:en-curso`, `estado:relevo`, `estado:bloqueado`, `estado:en-revision`;
  - agente actual: `agente:claude` o `agente:codex` (cambia con cada relevo).
- **Rama del paquete** `wxx-<tema>` (sin prefijo de agente, porque puede pasar de uno a otro), pusheada a GitHub.

## Paquetes y dependencias

| Paquete | Depende de | Puede ir en paralelo con |
| --- | --- | --- |
| W00 Contratos y persistencia | — | W03 (solo frontend) |
| W01 I18N | W00 (preferencias) | W04, W03 |
| W03 Audio | contrato I18N de W01 | casi todo |
| W04 Chat | W00, base de W01 | W01, W03 |
| W02 Expectativas y legal | W00, W01 | W04, W06 |
| W05 Catálogo, ofertas y saldo | W00, W02, W04 | W06 (contrato de saldo cerrado en W00) |
| W06 Agenda y zonas horarias | W00, W01, W04, contrato de saldo | W05 |
| W07 Google Calendar | W06 | W08 |
| W08 Zoom | W06 | W07 |
| W09 Integración y validación | incremental; cierre tras W01–W08 | — |

Un paquete está **disponible** cuando sus dependencias están mergeadas en `main`. Si hay varios, el orquestador prioriza el que desbloquea más trabajo (W00 → W01/W04 → W06/W05 → resto).

## Reglas de reparto dinámico

1. Andrés le dice a un agente que tiene cupo; el agente lee el issue «Orquestación» y toma el paquete que indique el orquestador, o el primero disponible si el orquestador no está activo.
2. Al tomar: etiqueta `estado:en-curso` + `agente:<él>`, y comenta alcance, archivos y requisitos (IDs) que cubrirá.
3. Con los dos agentes activos, cada uno en un paquete distinto y en su propio worktree; nunca los dos en la misma rama a la vez.
4. **Paquetes grandes en entregas cortas**: el orquestador parte cada paquete en pasos que entren en una ventana de 5 h (por ejemplo, W05: modelo y ledger → ofertas → checkout → renovación), cada uno como ítem del checklist y, si conviene, como PR propio.

## Protocolo de relevo

El límite puede cortar a un agente sin aviso, así que el relevo se prepara **mientras se trabaja**, no al final:

- **Siempre**: commit y push de la rama al terminar cada paso con pruebas verdes (WIP permitido: `wip(w04): …`). Marcar el ítem en el checklist del issue al cerrarlo.
- **Al acercarse al límite**, si se llega a tiempo: push y comentario «Relevo» en el issue con: hecho, a medias (archivo y qué falta), próximo paso concreto, pruebas que fallan, decisiones tomadas y dudas abiertas. Etiqueta `estado:relevo`.
- **Al retomar** (mismo agente u otro): leer el issue y el último comentario «Relevo» o, si no lo hay, el `git log` y el diff de la rama contra `main`; correr las pruebas; comentar «Retomo» y cambiar `agente:`.
- **Relevo del orquestador**: si Claude no tiene uso, Codex asume como orquestador comentando «Asumo orquestación» en el issue «Orquestación» y sigue sus reglas. Cuando Claude vuelve, lee esa bitácora y retoma con «Retomo orquestación». Mientras haya un solo agente, orquesta e implementa a la vez.

## Superficies compartidas

Dueño: el orquestador de turno. Lista: `backend/src/models/index.js`, `backend/src/migrations/`, `backend/src/config/permissions.js`, rutas raíz del backend, `frontend/src/app/app.routes.ts`, menús/navegación, `.env.example`, catálogos de traducción base y este documento.

- Quien implementa puede hacer **cambios aditivos mínimos** (registrar un modelo, una ruta, una variable, una migración nueva propia) y debe listarlos en la sección «Superficies compartidas tocadas» del PR.
- Prohibido reordenar, renombrar o refactorizar una superficie compartida fuera de W00.
- Migraciones: un archivo nuevo por PR con fecha actual; nunca editar una migración ya mergeada.
- Traducciones: cada paquete agrega sus claves bajo su propio prefijo (`chat.*`, `packages.*`, `schedule.*`…), sin tocar las ajenas.

## Entrega

PR contra `main` con el formato de SPEC §14.3, `Refs #<issue>` (o `Closes` en el último PR del paquete) y los agentes que trabajaron en él. Etiqueta del issue: `estado:en-revision`. El merge lo hace Andrés; luego el orquestador actualiza el issue «Orquestación» y marca disponibles los paquetes desbloqueados.

## Decisiones

| ID | Decisión | Afecta | Estado |
| --- | --- | --- | --- |
| D10 | Los paquetes se cobran por **Hotmart**; Stripe descartado (no viable desde Argentina). W00 define cómo una oferta se vincula a un producto de Hotmart y cómo se concilia el webhook. | PACK-13, W00, W05 | Confirmado el 22/10/2026 |

Una decisión nueva se agrega aquí y en el registro de SPEC §17 con fecha, responsable y requisitos afectados.
