# Workflow de Implementación de SPEC

Proceso **obligatorio** para cualquier agente que implemente una SPEC. Léelo completo antes de tocar código.

## Principio rector

Cada SPEC se implementa como una **serie de tareas atómicas**, cada una con su **rama**, su **test** y su **commit**. El avance se refleja **en tiempo real** marcando las tareas como completadas a medida que se terminan — **nunca al final**.

## 1. Preparación (antes de escribir código)

1. **Leer la SPEC** completa (`docs/spec/SPEC-XXX-nombre.md`) y sus criterios de aceptación.
2. **Crear/actualizar el archivo de tareas** `docs/tareas/SPEC-XXX-tareas.json` (formato Taskmaster-compatible). Desglosar la SPEC en tareas pequeñas y atómicas, cada una con:
   - `id`, `content`, `description`, `status` (`pending`), `priority`, `dependencies`, `subtasks`.
   - **Cada tarea debe incluir en su `description` qué test la valida** (unitario y/o E2E).
3. **Identificar los repos de desarrollo afectados** según el componente destino de la SPEC:
   - `qr-app` (frontend Next.js)
   - `backend-portaqr` (backend NestJS)
   - `qr-cms` (Payload CMS)
   - `e2e-tests-portaqr` (tests E2E)
4. **Baseline**: verificar que los tests existentes están verdes antes de tocar código (anotarlo en la tarea de preparación).

## 2. Ramas

- **Repos de desarrollo** (`qr-app`, `backend-portaqr`, `qr-cms`, `e2e-tests-portaqr`): crear una rama feature por SPEC en **cada repo afectado**.
  - Convención de nombre: `feat/spec-XXX-descripcion-corta` (ej. `feat/spec-026-checkout-pago`).
  - La rama se crea desde `main` (o desde la rama activa de la SPEC anterior si hay dependencia).
- **Repo principal** (`plataforma_qr_cursor`, donde viven `docs/`, `AGENTS.md`, `rules/`): **NO usar ramas**. Los cambios de documentación y tareas se commitean **directo a `main`**.

## 3. Ciclo por tarea (repetir para cada tarea)

Para **cada** tarea del `SPEC-XXX-tareas.json`:

1. **Implementar** la tarea en el repo de desarrollo correspondiente.
2. **Escribir/actualizar el test unitario** que valida el flujo modificado (Jest). Si el flujo no tiene test, **crearlo**.
3. **Variables de entorno**: si la tarea introduce variables nuevas, **agrégalas al `.env.example`** del proyecto con su documentación (qué hace, valores aceptados, uso, ejemplo). Ver `rules/common/environment-variables.md`.
4. **Validar** que el test nuevo y los existentes pasan:
   - `tsc --noEmit` (sin errores de tipos)
   - `lint`
   - `jest` (unitarios)
5. **Commit** atómico en el repo de desarrollo con mensaje descriptivo en español (ej. `feat(spec-026): CheckoutSteps con indicador de pasos`).
6. **Marcar la tarea como `done`** en `docs/tareas/SPEC-XXX-tareas.json` **inmediatamente**, anotando en `description` el resultado (tests verdes, commit hash). Esto permite ver el avance en cualquier momento.
7. **Commit** del archivo de tareas actualizado en el repo principal (`main`).

## 4. Tests E2E

- Al final de la implementación (o por tarea si aplica), **agregar tests E2E** (Playwright) en `e2e-tests-portaqr` para los **flujos que toca la SPEC**.
- Cubrir los criterios de aceptación de la SPEC como casos E2E.
- Los tests E2E viven en su propia rama `feat/spec-XXX-...` en `e2e-tests-portaqr`.

## 5. QA final

1. **Validación completa**: `tsc --noEmit`, `lint`, `jest` (unitarios), `build`, y suite E2E en los repos afectados.
2. **Revisión visual** en navegador de los flujos tocados (si aplica).
3. **Actualizar la SPEC** con el estado final (`implementado`) en el repo principal (`main`).
4. **Cerrar** la última tarea de QA en el archivo de tareas con el resumen de resultados.

## Checklist de cumplimiento

- [ ] Tareas desglosadas en `docs/tareas/SPEC-XXX-tareas.json` desde el inicio
- [ ] Rama feature creada en **cada** repo de desarrollo afectado
- [ ] Cada tarea tiene su test unitario (nuevo o actualizado)
- [ ] Variables nuevas documentadas en el `.env.example` (ver `rules/common/environment-variables.md`)
- [ ] Cada tarea tiene su commit atómico
- [ ] Tareas marcadas `done` **en tiempo real**, no al final
- [ ] Tests E2E agregados para los flujos de la SPEC
- [ ] `tsc`/`lint`/`jest`/`build` verdes
- [ ] SPEC actualizada a `implementado`
- [ ] Documentación y tareas commiteadas **directo a `main`** en el repo principal