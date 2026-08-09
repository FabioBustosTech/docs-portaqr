---
title: "SPEC-003: Auditoría y actualización de dependencias de qr-app"
date: 2026-08-07
tags:
  - spec
  - mantenimiento
  - frontend
  - seguridad
  - dependencias
  - auditoria
status: implementado
aliases:
  - SPEC-003
  - Auditoría dependencias qr-app
  - Actualización paquetes qr-app
---

# SPEC-003: Auditoría y actualización de dependencias de qr-app

> [!abstract] Decisión clave
> El proyecto `qr-app/` tiene **27 de 35 paquetes desactualizados** (77%) y **12 vulnerabilidades** (3 moderate, 7 high, **2 critical**). Las críticas están en `next@14.0.4` (30 CVEs acumulados) y `next-auth@4.24.11` (4 CVEs). **Decisión tomada (2026-08-07): quitar `next-auth`** — es una capa redundante (el backend ya emite `accessToken` + `refreshToken`) y **bloquea la migración a Next 16** (peerDependency solo llega a Next 15). Se reemplaza por JWT directo del backend con `jose` + `tokenVersion` para logout real, **migrando la firma de HS256 a RS256** (par de llaves: privada solo en backend, pública en frontend para verificar sin exponer la llave de firma). Plan de remediación en **3 fases**: (1) quitar next-auth + JWT directo RS256, (2) React 19 + Next 16, (3) resto de majors (eslint 9, typescript 6, tailwind 4, mui 9, etc.).

> [!success] Estado: IMPLEMENTADO (2026-08-07)
> Las 3 fases se ejecutaron y commitearon en la rama `feat/spec-003-actualizacion-dependencias` (qr-app: 7d31249, f537b1a, 801dcc0; backend-portaqr: 11a0118):
> - **Fase 1**: next-auth eliminado, JWT directo RS256 con `jose`, `POST /auth/logout` con `tokenVersion` (backend + frontend).
> - **Fase 2**: React 19.2.8 + Next 16.3.0 (Turbopack), params async, proxy.ts, cookies async.
> - **Fase 3**: typescript 6.0.3, tailwind 4.3.3 (CSS-first), MUI 9.3.1, sonner 2, lucide-react 1.30, tailwind-merge 3.6, uuid 14.
> - **Resultado**: `npm audit` = **0 vulnerabilidades** (antes 12, incl. 2 critical). `npm outdated` = 3 paquetes bloqueados por toolchain (TS 7 no soportado por typescript-eslint; ESLint 10 no soportado por eslint-config-next@16; @types/node 26 vs runtime Node 20).
> - **Pendiente menor**: login real con credenciales (backend corriendo en :3004), flujo de refresh automático con `POST /auth/refresh` (cookie ya se guarda), 2 errores de lint preexistentes en `eliminacion-de-datos/page.tsx`.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-07
> - **Autor:** Equipo Plataforma QR
> - **Componente afectado:** `desarrollo-qr/qr-app/` (puerto 3000)
> - **Alcance:** Solo `qr-app/`. No incluye `bff-service/`, `user-service/` ni `qr-service/` (auditoría separada pendiente).
> - **Relacionado:** [[SPEC-001-migracion-monolito-modular]], [[SPEC-002-qr-multilink-imagen]]

---

## 1. Objetivo

Documentar el estado actual de las dependencias de `qr-app/`, priorizar la remediación de vulnerabilidades de seguridad y definir un plan de actualización por fases que minimice el riesgo de regresiones.

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-003 |
| --- | --- | --- |
| Seguridad | 2 vulnerabilidades **critical** (next, next-auth) | 0 critical, 0 high |
| Mantenibilidad | 27/35 paquetes desactualizados | ≤ 5 paquetes con major pendiente (planificados) |
| Compatibilidad | `eslint-config-next@15` con `next@14` (inconsistente) | Versiones alineadas |
| Deuda técnica | 3 sistemas de UI coexistiendo (MUI, Radix, lucide) | Evaluación de consolidación documentada |

### 1.2 Out of scope (no incluido en este spec)

- Auditoría de dependencias de los servicios backend (`bff-service`, `user-service`, `qr-service`) — se recomienda como spec futuro.
- Migración de código de los sistemas de UI (solo se documenta la evaluación).
- Cambios de arquitectura de autenticación (next-auth v4 → v5/Auth.js) — se documenta como decisión futura.

---

## 2. Especificación

### 2.1 Estado actual (hallazgos de la auditoría)

Ejecutado el 2026-08-07 con `npm outdated` y `npm audit` en `desarrollo-qr/qr-app/`.

#### 2.1.1 Resumen de vulnerabilidades (`npm audit`)

| Severidad | Cantidad | Paquetes afectados |
| --- | --- | --- |
| **CRITICAL** | 2 | `next`, `next-auth` |
| **HIGH** | 7 | `brace-expansion`, `flatted`, `glob`, `js-yaml`, `minimatch`, `picomatch`, `postcss` |
| **MODERATE** | 3 | `ajv`, `uuid`, `yaml` |
| **Total** | **12** | — |

#### 2.1.2 Vulnerabilidades en dependencias directas

| Paquete | Versión actual | Severidad | CVEs | Fix disponible |
| --- | --- | --- | --- | --- |
| `next` | 14.0.4 (pin fija) | CRITICAL | 30+ (SSRF, cache poisoning, auth bypass, XSS, DoS, request smuggling) | `npm audit fix --force` → 14.2.35 |
| `next-auth` | 4.24.11 | CRITICAL | 4 (email misdelivery, getToken crash, homoglyph bypass, OAuth cookie binding) | `npm audit fix` → 4.24.15 |

#### 2.1.3 Vulnerabilidades transitivas

| Paquete | Severidad | Origen | Fix |
| --- | --- | --- | --- |
| `brace-expansion` | HIGH (6 CVEs) | eslint, glob | `npm audit fix` |
| `flatted` | HIGH (2 CVEs) | eslint | `npm audit fix` |
| `glob` | HIGH (1 CVE) | eslint | `npm audit fix` |
| `js-yaml` | HIGH (4 CVEs) | eslint | `npm audit fix` |
| `minimatch` | HIGH (4 CVEs) | eslint, glob | `npm audit fix` |
| `picomatch` | HIGH (2 CVEs) | eslint | `npm audit fix` |
| `postcss` | HIGH (4 CVEs) | next (transitivo) | `npm audit fix --force` |
| `ajv` | MODERATE (1 CVE) | eslint | `npm audit fix` |
| `uuid` | MODERATE (1 CVE) | next-auth | `npm audit fix` |
| `yaml` | MODERATE (1 CVE) | eslint | `npm audit fix` |

> [!note] Origen de la mayoría de transitivas
> La mayoría de las vulnerabilidades transitivas provienen de **`eslint@8`**, que arrastra versiones viejas de `glob`, `minimatch`, `js-yaml`, `flatted`, `picomatch`, `ajv` y `brace-expansion`. Actualizar a ESLint 9+ (flat config) las resolvería en cascada.

#### 2.1.4 Paquetes desactualizados (`npm outdated`)

**Nivel 1 — Saltos de major (breaking changes posibles):**

| Paquete | Actual | Latest | Major jump | Notas |
| --- | --- | --- | --- | --- |
| `next` | 14.0.4 | 16.3.0 | 14→16 | ⚠️ Crítico por CVEs. Migrar al menos a 14.2.35 ya |
| `react` / `react-dom` | 18.3.1 | 19.2.8 | 18→19 | Migración grande. Revisar Server Components changes |
| `@mui/material` + `@mui/icons-material` | 6.4.0 | 9.3.1 | 6→9 | 3 majors atrás. Licencia ahora requiere orden |
| `lucide-react` | 0.469.0 | 1.30.0 | 0.x→1.x | Estabilización de API |
| `sonner` | 1.7.1 | 2.0.7 | 1→2 | Cambios en API de toast |
| `tailwind-merge` | 2.6.0 | 3.6.0 | 2→3 | Posibles cambios en merge config |
| `tailwindcss` | 3.4.17 | 4.3.3 | 3→4 | ⚠️ Tailwind v4 es rewrite completo (engine CSS-first) |
| `typescript` | 5.7.2 | 7.0.2 | 5→7 | Saltó v6. Revisar breaking changes |
| `uuid` | 11.0.4 | 14.0.1 | 11→14 | Cambios en API de versiones legacy |
| `eslint` | 8.57.1 | 10.8.0 | 8→10 | ESLint 9+ cambia config system (flat config) |
| `eslint-config-next` | 15.4.1 | 16.3.0 | 15→16 | Debe alinearse con versión de `next` |

**Nivel 2 — Parches menores (seguros, dentro del rango `^`):**

| Paquete | Actual | Wanted | Tipo |
| --- | --- | --- | --- |
| `@radix-ui/react-dialog` | 1.1.5 | 1.1.23 | patch |
| `@radix-ui/react-select` | 2.1.4 | 2.3.7 | minor |
| `@radix-ui/react-switch` | 1.1.2 | 1.3.7 | minor |
| `chart.js` | 4.4.7 | 4.5.1 | minor |
| `next-auth` | 4.24.11 | 4.24.15 | patch |
| `next-themes` | 0.4.4 | 0.4.6 | patch |
| `postcss` | 8.4.49 | 8.5.26 | minor |
| `react-chartjs-2` | 5.3.0 | 5.3.1 | patch |
| `react-hook-form` | 7.54.2 | 7.84.0 | minor |
| `tailwind-merge` | 2.6.0 | 2.6.1 | patch |
| `tailwindcss` | 3.4.17 | 3.4.19 | patch |
| `zustand` | 5.0.3 | 5.0.14 | patch |
| `autoprefixer` | 10.4.20 | 10.5.4 | minor |
| `@types/node` | 20.17.11 | 20.19.43 | minor |
| `@types/react` | 18.3.18 | 18.3.31 | patch |
| `@types/react-dom` | 18.3.5 | 18.3.7 | patch |

**Nivel 3 — Sin actualización disponible (ya en latest compatible):**

| Paquete | Estado |
| --- | --- |
| `@hello-pangea/dnd` | 18.0.1 (actual = wanted) |
| `@heroicons/react` | 2.2.0 |
| `class-variance-authority` | 0.7.1 |
| `clsx` | 2.1.1 |
| `html2canvas` | 1.4.1 |
| `qrcode.react` | 4.2.0 |

### 2.2 Requisitos funcionales (RF)

- **RF-1**. Eliminar las **2 vulnerabilidades CRITICAL** (`next`, `next-auth`) como prioridad inmediata.
- **RF-2**. Reducir las vulnerabilidades HIGH a 0 (transitivas de eslint y postcss).
- **RF-3**. Actualizar todos los paquetes del Nivel 2 (parches menores) sin romper la API.
- **RF-4**. Alinear `eslint-config-next` con la versión de `next` instalada.
- **RF-5**. Documentar y planificar las migraciones de major (Nivel 1) una por una, con validación de `tsxValidate` (`npx tsc --noEmit`) y `lint` después de cada una.
- **RF-6**. No romper el build de producción (`next build`) en ninguna fase.
- **RF-7**. Mantener la compatibilidad con `react@18` mientras no se migre a React 19 (los paquetes que requieran React 19 se bloquean hasta la Fase 2).

### 2.3 Criterios de aceptación (CA)

- **CA-01**. `npm audit` reporta **0 vulnerabilities** (o solo moderadas con fix documentado) tras la Fase 1.
- **CA-02**. `npm outdated` muestra 0 paquetes en la columna "Wanted" tras la Fase 2.
- **CA-03**. `npx tsc --noEmit` pasa sin errores tras cada fase.
- **CA-04**. `npm run lint` pasa sin errores tras cada fase.
- **CA-05**. `npm run build` genera el build de producción exitosamente tras cada fase.
- **CA-06**. El flujo de autenticación con **JWT directo del backend** (login, logout, refresh, rutas protegidas) funciona correctamente tras la Fase 1 (sin next-auth).
- **CA-07**. El dashboard y la página pública `/qr/[id]` renderizan sin regresión tras cada fase.

---

## 3. Diseño Técnico

### 3.1 Plan de remediación en 3 fases

> [!important] Plan actualizado (2026-08-07) — reemplaza al plan original de parches
> El plan original (parchear next-auth con `npm audit fix`) quedó **obsoleto** tras la decisión de **quitar next-auth** (§3.3). El plan vigente es el de la §6, en 3 fases:
> - **Fase 1 — Quitar next-auth + JWT directo RS256** (3-4 días): backend (llaves RS256, tokenVersion, logout) + frontend (jose, AuthContext propio, ~55 archivos).
> - **Fase 2 — React 19 + Next 16** (2-3 días): react 19.2, next 16.3, codemods async params, proxy.ts, Turbopack.
> - **Fase 3 — Resto de majors** (2-3 días): eslint 9/10 flat config, typescript 6, tailwind 4, MUI 9, sonner 2, lucide 1, tailwind-merge 3, uuid 14.

#### Fase 1 — Parches de seguridad urgentes (hoy)

```bash
# Arregla next-auth, uuid, y la mayoría de transitivas sin breaking changes
npm audit fix

# Para next y postcss (requiere forzar versión segura dentro del major 14)
npm audit fix --force
```

Resultado esperado: `next@14.2.35` (parche seguro, sin migración de major), `next-auth@4.24.15`, transitivas de eslint resueltas.

> [!warning] `npm audit fix --force` instala `next@14.2.35`, que está fuera del rango declarado (`"next": "14.0.4"` pin fija). Actualizar `package.json` explícitamente a `"^14.2.35"` y testear.
>
> > [!note] Esta sección quedó obsoleta
> > El parche de `next-auth` a 4.24.15 ya no aplica: la decisión es **eliminar** next-auth (§3.3). Los comandos `npm audit fix` se reemplazan por el plan de la §6. Se mantiene solo como referencia histórica.

#### Fase 2 — Actualización de parches menores (esta semana)

```bash
npm update
```

Actualiza todos los paquetes a su versión "Wanted" (columna del outdated). Sin breaking changes.

#### Fase 3 — Migraciones de major (planificadas, una a la vez)

Orden recomendado por riesgo/beneficio:

| # | Migración | Riesgo | Validación clave |
| --- | --- | --- | --- |
| 1 | `next` 14.2.x → 15.x | Medio | Migration guide oficial; revisar `next.config.js` |
| 2 | `eslint` 8 → 9+ | Medio | Migrar a flat config (`eslint.config.mjs`) |
| 3 | `typescript` 5.7 → 6.x | Medio | Revisar breaking changes de TS 6 |
| 4 | `tailwindcss` 3 → 4 | Alto | Rewrite completo (engine CSS-first) |
| 5 | `react` 18 → 19 | Alto | Migración grande, hacer al final |
| 6 | `@mui/material` 6 → 9 | Medio | Revisar cambios de licencia y API |
| 7 | `sonner`, `lucide-react`, `tailwind-merge`, `uuid` | Bajo | Migraciones menores |

> [!warning] No ejecutar `npm audit fix --force` sin revisión en producción
> Forzaría `next@14.2.35` que, aunque seguro, puede tener cambios menores de comportamiento. Mejor actualizar `package.json` explícitamente y testear.

### 3.2 Observaciones arquitectónicas

1. **`next` está fijo sin `^`** (`"next": "14.0.4"`), lo que bloquea parches automáticos. Considerar cambiar a `"^14.2.35"` o migrar a 15.x.
2. **`eslint-config-next` está en 15.x mientras `next` está en 14.x** — inconsistencia que puede causar falsos positivos/negativos en lint.
3. **Coexistencia de 3 sistemas de UI** (`@mui/material`, `@radix-ui/*`, `lucide-react`) — posible deuda técnica. Evaluar consolidación antes de migrar MUI 6→9.
4. **`react` y `react-dom` están con `^18`** (sin patch), lo que permite saltar a 18.3.1 pero no a 19. Correcto si se quiere estabilizar en 18.

### 3.3 Decisión de autenticación: next-auth vs. JWT directo (DECIDIDO: Opción C)

> [!important] Estado de la decisión
> **DECIDIDO (2026-08-07) — Opción C: quitar next-auth y usar JWT del backend directo.** El usuario confirmó que quiere eliminar next-auth. Además, next-auth v4 **bloquea la migración a Next 16** (peerDependency `next@"^12.2.5 || ^13 || ^14 || ^15"` no incluye 16), por lo que quitarlo es **obligatorio** para el objetivo de dejar todo al día.

#### 3.3.1 Contexto (hallazgos verificados en el código)

| Hallazgo | Evidencia |
| --- | --- |
| El backend **ya emite `accessToken` + `refreshToken`** | `backend-portaqr/src/modules/auth/domain/services/jwt.service.ts` — `generateTokens()` con secrets separados (`JWT_SECRET` / `JWT_REFRESH_SECRET`) |
| El backend **ya tiene `POST /auth/refresh`** (rotación de tokens) | `auth.controller.ts:42` + `auth.service.ts:67` |
| El backend **NO tiene logout ni revocación** de tokens | grep `logout\|tokenVersion\|blacklist\|revoke` → 0 resultados |
| next-auth **solo usa el `accessToken`** y descarta el `refreshToken` | `qr-app/src/app/api/auth/[...nextauth]/authOptions.ts:107` |
| next-auth es una **capa redundante**: re-firma el JWT del backend con `NEXTAUTH_SECRET` | `authOptions.ts` callbacks `jwt`/`session` |
| next-auth se usa en **~55 archivos** (middleware, ~30 API routes, ~25 componentes) | grep `next-auth` → 69 matches |
| El usuario **ya implementó Google OAuth sin librería** en otro proyecto | Decisión del usuario (2026-08-07) |

#### 3.3.2 Las 3 opciones

| Criterio | A) Mantener next-auth v4 (parchear) | B) Migrar a Auth.js v5 | C) Quitar next-auth, JWT directo |
| --- | --- | --- | --- |
| Esfuerzo | Mínimo (1 comando) | Alto (~30 archivos) | Medio (~55 archivos, mecánico) |
| Riesgo | Bajo | Medio-alto | Medio |
| CVEs de next-auth | Resueltos (4) | Resueltos | **Eliminados de raíz** |
| Capa redundante | Se mantiene | Se mantiene | **Se elimina** |
| Logout real (revocación) | ❌ No resuelve | ❌ No resuelve por sí solo | ✅ Requiere completar backend (tokenVersion + logout) |
| OAuth social (Google) | No soporta bien | ✅ Nativo | ✅ Provider en backend (ya lo hizo el usuario) |
| Dependencia nueva | Ninguna | next-auth v5 | `jose` (validación JWT) |

#### 3.3.3 Árbol de decisión (cómo ir decidiendo)

```
¿El proyecto usará login social (Google/GitHub/Apple)?
│
├── NO → ¿El backend ya emite JWT propio?
│         ├── SÍ → Opción C (quitar next-auth) ✅ RECOMENDADO
│         └── NO → Opción A (mantener next-auth)
│
└── SÍ → ¿El usuario ya implementó OAuth sin librería?
         ├── SÍ → Opción C (integrar Google como provider en backend) ✅ RECOMENDADO
         └── NO → Opción B (Auth.js v5 maneja el flujo OAuth)
```

**Preguntas guía para resolver la decisión:**

1. **¿El backend es la fuente de verdad de auth?** → Si sí (emite JWT, valida, tiene `/auth/profile`), next-auth es una capa redundante → Opción C.
2. **¿Se necesita revocación de sesión (logout real)?** → Si sí, hay que completar el backend con `tokenVersion` + `POST /auth/logout` independientemente de la opción elegida.
3. **¿Se usará OAuth social?** → Si el usuario ya lo implementó sin librería, Opción C; si no, evaluar Auth.js v5.
4. **¿Cuánto tiempo hay para el refactor?** → Opción C son ~4-6 días totales (backend + frontend + Google). Si no hay tiempo, parchear (Opción A) como puente.

#### 3.3.4 Plan de decisión (pasos concretos)

| Paso | Acción | Resultado esperado |
| --- | --- | --- |
| 1 | ~~**Fase 1 (inmediato)**: parchear next-auth a 4.24.15 (`npm audit fix`)~~ — **OBSOLETO**: decisión es eliminar next-auth (§3.3) | 4 CVEs críticos resueltos, sin riesgo |
| 2 | Verificar si el backend guarda refresh tokens en BD (colección `refresh_tokens` o campo en `User`) | Determina si el logout requiere migración de datos |
| 3 | Decidir con el usuario: ¿Google OAuth es un requisito de corto plazo? | Desbloquea Opción B vs C |
| 4 | Si Opción C: implementar `tokenVersion` en `User` + `POST /auth/logout` en backend | Logout real (revocación) |
| 5 | Si Opción C: reemplazar next-auth por hook `useAuth()` + `jose` en middleware + validación JWT en API routes | Eliminar dependencia |
| 6 | Si Opción C: integrar `POST /auth/google` en backend + botón Google en frontend | Login social sin librería |

> [!warning] Decisión mínima obligatoria
> Independientemente de la opción, **el backend necesita `tokenVersion` + `POST /auth/logout`** para resolver el problema del JWT vivo tras el logout. Sin eso, ninguna opción da logout real.

#### 3.3.5 Riesgos de cada opción

| Opción | Riesgo principal | Mitigación |
| --- | --- | --- |
| A | Capa redundante persiste; v4 en modo mantenimiento | Aceptar como deuda temporal |
| B | Refactor grande sin beneficio claro si el backend ya hace el trabajo | Solo si se necesita OAuth nativo |
| C | Refactor de ~55 archivos; riesgo de romper auth | Migrar por etapas: primero backend (logout), luego frontend (hook), validar con CA-06 |

#### 3.3.6 Plan de implementación — Opción C (quitar next-auth)

> [!success] Decisión confirmada
> **Quitar next-auth y usar JWT del backend directo.** El backend ya emite `accessToken` + `refreshToken` (`jwt.service.ts`), ya tiene `POST /auth/refresh`, y el frontend ya tiene `AuthContext` con hook `useAuth()` propio. Solo falta: (a) logout real en backend (`tokenVersion`), (b) reemplazar las ~55 referencias a next-auth.

##### Backend (`backend-portaqr/`) — logout real + firma asimétrica (RS256)

> [!important] Cambio de algoritmo de firma: HS256 → RS256
> **Motivo**: el frontend validará el JWT con `jose` (middleware + API routes). Con HS256 (secreto compartido), el frontend necesitaría el `JWT_SECRET` — la misma llave que firma — exponiendo la capacidad de forjar tokens si se filtra. Con **RS256** (asimétrico):
> - Backend firma con **llave privada** (nunca sale del backend).
> - Frontend valida con **llave pública** (no sensible, puede vivir en el frontend).
> - Robar la llave pública NO permite forjar tokens.

1. **Generar par de llaves RS256** (una vez, guardar en `.env` o archivos PEM):
   ```bash
   # Generar llave privada (PKCS#8 PEM)
   openssl genpkey -algorithm RSA -out jwt-private.pem -pkeyopt rsa_keygen_bits:2048
   # Derivar llave pública
   openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
   ```
   - `JWT_PRIVATE_KEY` (backend, firma) — **nunca exponer**
   - `JWT_PUBLIC_KEY` (backend + frontend, verificación) — pública
   - Mismo par para access y refresh (o pares separados `JWT_*_PRIVATE/PUBLIC` si se quiere aislar).

2. **`jwt.service.ts`** — firmar con llave privada (RS256):
   ```ts
   const [accessToken, refreshToken] = await Promise.all([
     this.jwtService.signAsync(payload, {
       privateKey: this.configService.get<string>('JWT_PRIVATE_KEY'),
       algorithm: 'RS256',
       expiresIn: this.configService.get<string>('JWT_EXPIRATION') as StringValue,
     }),
     this.jwtService.signAsync(payload, {
       privateKey: this.configService.get<string>('JWT_REFRESH_PRIVATE_KEY'),
       algorithm: 'RS256',
       expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION') as StringValue,
     }),
   ]);
   ```

3. **`jwt.service.ts` verify** — validar con llave pública:
   ```ts
   verifyToken(token) {
     return this.jwtService.verify<JwtPayload>(token, {
       publicKey: this.configService.get<string>('JWT_PUBLIC_KEY'),
       algorithms: ['RS256'],
     });
   }
   verifyRefreshToken(token) {
     return this.jwtService.verify<JwtPayload>(token, {
       publicKey: this.configService.get<string>('JWT_REFRESH_PUBLIC_KEY'),
       algorithms: ['RS256'],
     });
   }
   ```

4. **`JwtStrategy`** (`jwt.strategy.ts`): `secretOrKey` → `publicKey`:
   ```ts
   super({
     jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
     ignoreExpiration: false,
     secretOrKey: configService.get<string>('JWT_PUBLIC_KEY'),
     algorithms: ['RS256'],
   });
   ```

5. **`tokenVersion` en el modelo `User`** (`users/domain/entities/user.entity.ts`):
   ```ts
   tokenVersion: { type: Number, default: 0 }
   ```

6. **Incluir `tokenVersion` en el payload JWT** (`jwt.service.ts`):
   ```ts
   const payload: JwtPayload = { sub, email, userName, role, isEmailVerified, tokenVersion: user.tokenVersion };
   ```

7. **Validar `tokenVersion` en `JwtStrategy.validate`**: si `payload.tokenVersion !== user.tokenVersion` → `UnauthorizedException` (token revocado).

8. **Nuevo endpoint `POST /auth/logout`** (`auth.controller.ts` + `auth.service.ts`):
   ```ts
   @Post('logout')
   @UseGuards(JwtAuthGuard)
   async logout(@Request() req) {
     // incrementa user.tokenVersion → invalida TODOS los tokens del usuario
     await this.updateUserUseCase.incrementTokenVersion(req.user.id);
     return { message: 'Sesión cerrada' };
   }
   ```

9. **Verificar `JWT_REFRESH_EXPIRATION`** en `.env` (recomendado: 7d) y `JWT_EXPIRATION` (recomendado: 15-30 min).

##### Frontend (`qr-app/`) — reemplazar next-auth

| Archivo | Cambio |
| --- | --- |
| `src/app/api/auth/[...nextauth]/route.ts` + `authOptions.ts` | **Eliminar** |
| `src/interfaces/next-auth.d.ts` | **Eliminar** |
| `src/app/ClientLayout.tsx` | Quitar `SessionProvider` (queda solo `AuthProvider`) |
| `src/contexts/AuthContext.tsx` | Reemplazar `useSession()` por lectura de cookie JWT + `authService` |
| `src/components/LoginForm/index.tsx` | `signIn('credentials')` → `authService.login()` + guardar tokens en cookie |
| `src/components/AuthButtons/index.tsx` | `signOut()` → `POST /auth/logout` + limpiar cookie |
| `src/hooks/useInactivityTimeout.ts` | `signOut()` → logout propio |
| `src/components/InactivityWarning.tsx` | `signOut()` → logout propio |
| `src/components/dashboard/Sidebar.tsx`, `DashboardHeader.tsx` | `useSession()` → `useAuth()` |
| `src/components/navigation.tsx` | `useSession()` → `useAuth()` |
| `src/services/scan.service.ts`, `statistics.service.ts` | `getSession()` → leer token de cookie |
| ~30 API routes (`src/app/api/*/route.ts`) | `getServerSession()` → validar JWT con `jose` |
| `src/middleware.ts`, `src/middlewareIP.ts` | `getToken()` → validar JWT con `jose` |
| `package.json` | Eliminar `next-auth` |

**Nueva dependencia**: `jose` (validación JWT en middleware y API routes, edge-compatible).

**Nuevo helper**: `src/lib/auth.ts` — funciones `getTokenFromCookie()`, `setAuthCookies()`, `clearAuthCookies()`, `verifyJwt()` (con `jose` y la **llave pública** RS256 del backend).

> [!note] Cookies de sesión
> Guardar `accessToken` y `refreshToken` en cookies `httpOnly` (seteadas desde una API route del frontend, ej. `POST /api/auth/login` que reenvía al backend). El middleware y las API routes leen el token de la cookie y lo validan con `jose` usando **`JWT_PUBLIC_KEY`** (llave pública RS256, no sensible). La llave privada solo existe en el backend.

> [!warning] Seguridad de llaves
> - `JWT_PRIVATE_KEY` → **solo en backend** (`.env`, Docker secrets, Railway vars). Nunca en el frontend ni en repos.
> - `JWT_PUBLIC_KEY` → backend + frontend (segura de compartir, solo verifica).
> - Con RS256, comprometer el frontend NO permite forjar tokens — a diferencia de HS256 donde el secreto compartido lo permitiría.

##### Google OAuth (futuro, mismo patrón)

- `POST /auth/google` en backend: recibe `id_token` de Google, lo verifica con claves públicas, crea/vincula usuario, emite JWT propio.
- Frontend: botón Google con Google Identity Services → manda `id_token` al backend.
- No requiere librería de auth en el frontend.

---

## 4. Mockups / Referencias

- `npm outdated` y `npm audit` ejecutados en `desarrollo-qr/qr-app/` (2026-08-07).
- Migration guides oficiales:
  - Next.js: https://nextjs.org/docs/app/building-your-application/upgrading
  - ESLint: https://eslint.org/docs/latest/use/migrate-to-9.0.0
  - Tailwind CSS v4: https://tailwindcss.com/docs/upgrade-guide
  - React 19: https://react.dev/blog/2024/12/05/react-19
  - MUI: https://mui.com/material-ui/migration/upgrade-to-v6/

---

## 5. Trade-offs

### 5.1 ADR-003.1 — Actualizar `next` a 14.2.35 vs. migrar a 15.x

> [!question] Contexto
> `next@14.0.4` tiene 30+ CVEs. `npm audit fix --force` propone 14.2.35 (parche dentro del major 14). La latest es 16.3.0.

> [!tip] Alternativas consideradas
> - **A)** Actualizar a `14.2.35` (parche seguro, mismo major). Pros: mínimo riesgo, resuelve todos los CVEs. Contras: sigue en major 14, habrá que migrar después.
> - **B)** Migrar directo a 15.x. Pros: resuelve CVEs y moderniza. Contras: breaking changes (async request APIs, `next/image` changes), más tiempo.
> - **C)** Migrar a 16.x. Pros: latest. Contras: máximo riesgo, requiere migrar React 19 primero.

> [!success] Decisión
> **Alternativa A** para la Fase 1 (urgente, bajo riesgo). La migración a 15.x se planifica en la Fase 3 con validación completa.

### 5.2 ADR-003.2 — ESLint 8 → 9 (flat config)

> [!question] Contexto
> `eslint@8` arrastra la mayoría de las vulnerabilidades transitivas HIGH. ESLint 9+ cambia el sistema de configuración a flat config.

> [!tip] Alternativas consideradas
> - **A)** Mantener ESLint 8 y aceptar las transitivas (mitigadas por ser devDependencies, no llegan a producción).
> - **B)** Migrar a ESLint 9+ con flat config. Pros: elimina ~15 vulnerabilidades transitivas. Contras: requiere reescribir `.eslintrc` a `eslint.config.mjs`.

> [!success] Decisión
> **Alternativa B** en la Fase 3 (planificada). Las transitivas de eslint son devDependencies (no llegan a producción), por lo que no bloquean la Fase 1.

### 5.3 ADR-003.3 — React 18 vs. React 19

> [!question] Contexto
> `react@18.3.1` es la versión actual. React 19 es latest. Varios paquetes (MUI 9, sonner 2) requieren React 19.

> [!tip] Alternativas consideradas
> - **A)** Mantener React 18 y quedarse en versiones compatibles de MUI/sonner.
> - **B)** Migrar a React 19 al final de la Fase 3, cuando todos los demás majors estén resueltos.

> [!success] Decisión
> **Alternativa B** — React 19 se migra al final porque es la dependencia con más impacto (Server Components, hooks). Mientras tanto, los paquetes que requieran React 19 se mantienen en versiones compatibles con 18.

---

## 6. Plan de implementación (tareas)

> [!todo] Taskmaster
> Registrar como tareas en `docs/tarea/SPEC-003-tareas.json` (formato Taskmaster-compatible). Estimación total: **~7-9 días** (Fase 1: 3-4d, Fase 2: 2-3d, Fase 3: 2-3d).

### Fase 1 — Quitar next-auth + JWT directo (3-4 días)

| ID | Tarea | Fase | Estimación |
| --- | --- | --- | --- |
| T-003-01 | **Backend**: generar par de llaves RS256 (`openssl`), configurar `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` en `.env` | 1 | 0.3d |
| T-003-02 | **Backend**: `jwt.service.ts` firma RS256 (privateKey) + verify RS256 (publicKey) + `verifyRefreshToken` | 1 | 0.3d |
| T-003-03 | **Backend**: `JwtStrategy` usa `publicKey` + `algorithms: ['RS256']` | 1 | 0.2d |
| T-003-04 | **Backend**: `tokenVersion` en `User` + payload JWT + validación en `JwtStrategy.validate` | 1 | 0.5d |
| T-003-05 | **Backend**: `POST /auth/logout` (incrementa tokenVersion) + tests | 1 | 0.5d |
| T-003-06 | **Frontend**: `src/lib/auth.ts` (cookies httpOnly + `jose` verify con publicKey) + `POST /api/auth/login` proxy | 1 | 0.5d |
| T-003-07 | **Frontend**: `AuthContext` sin `useSession` + quitar `SessionProvider` de `ClientLayout` | 1 | 0.5d |
| T-003-08 | **Frontend**: `LoginForm` → `authService.login()` + guardar cookies | 1 | 0.5d |
| T-003-09 | **Frontend**: `signOut` → `POST /auth/logout` + limpiar cookies (AuthButtons, InactivityWarning, useInactivityTimeout) | 1 | 0.5d |
| T-003-10 | **Frontend**: `useSession()` → `useAuth()` en ~15 componentes (Sidebar, DashboardHeader, navigation, QrGrid, CreateQrForm, páginas dashboard) | 1 | 0.5d |
| T-003-11 | **Frontend**: `getSession()` → leer cookie en services (scan, statistics) | 1 | 0.2d |
| T-003-12 | **Frontend**: `getServerSession()` → `jose` verify (publicKey) en ~30 API routes | 1 | 1d |
| T-003-13 | **Frontend**: `middleware.ts` + `middlewareIP.ts` → `jose` verify (publicKey) | 1 | 0.5d |
| T-003-14 | **Frontend**: eliminar `[...nextauth]/`, `next-auth.d.ts`, `next-auth` de package.json | 1 | 0.2d |
| T-003-15 | **Validación Fase 1**: `tsc --noEmit`, `lint`, `build`, login/logout, dashboard, `/qr/[id]` | 1 | 0.5d |

### Fase 2 — React 19 + Next 16 (2-3d)

| # | Tarea | Fase | Estimación |
| --- | --- | --- | --- |
| T-003-16 | `react`/`react-dom` → `^19.2.8` + `@types/react`/`@types/react-dom` → `^19` | 2 | 0.5d |
| T-003-17 | `next` → `16.3.0` + `eslint-config-next` → `^16` | 2 | 0.2d |
| T-003-18 | `npx @next/codemod upgrade` + `npx @next/codemod next-async-request-api .` (41 archivos params/searchParams) | 2 | 1d |
| T-003-19 | `cookies()`/`headers()` → `await` (cart, cart-admin, ip) | 2 | 0.3d |
| T-003-20 | `middleware.ts` → `proxy.ts` (renombrado en Next 16) + `next.config.js` → Turbopack | 2 | 0.5d |
| T-003-21 | **Validación Fase 2**: `tsc --noEmit`, `lint`, `build`, smoke test completo | 2 | 0.5d |

### Fase 3 — Resto de majors (2-3d)

| ID | Tema | Fase | Estimación |
| --- | --- | --- | --- |
| T-003-22 | `eslint` 8 → 9/10 (flat config `eslint.config.mjs`) — elimina transitivas HIGH | 3 | 0.5d |
| T-003-23 | `typescript` 5.7 → 6.x | 3 | 0.5d |
| T-003-24 | `tailwindcss` 3 → 4 (rewrite CSS-first) | 3 | 1d |
| T-003-25 | `@mui/material` 6 → 9 + `@mui/icons-material` | 3 | 1d |
| T-003-26 | `sonner` 1→2, `lucide-react` 0.x→1.x, `tailwind-merge` 2→3, `uuid` 11→14 | 3 | 0.5d |
| T-003-27 | `npm update` (parches menores restantes) + `npm audit` final | 3 | 0.3d |
| T-003-28 | **Validación Fase 3**: `tsc --noEmit`, `lint`, `build`, smoke test completo | 3 | 0.5d |
| T-003-29 | Auditoría de dependencias de servicios backend (spec futuro) | — | 0.5d |
| T-003-30 | **Futuro**: `POST /auth/google` en backend + botón Google en frontend | — | 1-2d |

---

## 7. Testing

### 7.1 Validación por fase

Cada fase debe pasar:

1. `npx tsc --noEmit` — sin errores de tipos.
2. `npm run lint` — sin errores de lint.
3. `npm run build` — build de producción exitoso.
4. Smoke test manual: login, dashboard `/dashboard/qr`, página pública `/qr/[id]`.

### 7.2 Tests específicos de la Fase 1 (quitar next-auth)

- **Backend**: `POST /auth/logout` incrementa `tokenVersion` → el access token anterior queda inválido (401).
- **Backend**: `JwtStrategy` rechaza tokens con `tokenVersion` desactualizado.
- **Frontend**: login con `authService.login()` guarda cookies httpOnly correctamente.
- **Frontend**: logout limpia cookies y redirige a `/login`.
- **Frontend**: rutas protegidas siguen protegidas (middleware con `jose`).
- **Frontend**: API routes rechazan requests sin token válido (401).
- **Frontend**: página pública `/qr/[id]` renderiza sin errores (no requiere auth).

### 7.3 Tests específicos de la Fase 2 (React 19 + Next 16)

- `npx @next/codemod` aplicado sin errores en los 41 archivos de params/searchParams.
- `cookies()`/`headers()` con `await` en cart, cart-admin, ip.
- `proxy.ts` (ex-middleware) protege `/dashboard/*` correctamente.
- Build con Turbopack exitoso.
- Smoke test completo: login, dashboard, CRUD QR, página pública, webpay.

### 7.4 Tests específicos de la Fase 3 (majors restantes)

- ESLint 9/10 con flat config: `npm run lint` pasa.
- Tailwind v4: estilos visuales sin regresión (comparar screenshots).
- MUI 9: componentes renderizan sin errores.
- `npm audit` final: 0 vulnerabilities (o solo moderadas documentadas).

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Refactor de auth rompe login/sesión | Media | Alto | Migrar por etapas (backend primero, luego frontend); validar CA-06 en cada paso |
| Cookies httpOnly mal configuradas (CSRF/XSS) | Media | Alto | `SameSite=Lax`, `Secure` en prod, validar con `jose` en cada request |
| `tokenVersion` invalida sesiones de usuarios activos al deployar | Alta | Medio | Incrementar solo en logout; no en deploy (default 0) |
| Migración de major rompe el build | Alta | Alto | Una migración a la vez, validación completa entre cada una |
| React 19 rompe librerías de terceros | Media | Alto | Verificado: todas las libs actuales soportan React 19 (peerDeps) |
| Tailwind v4 rompe estilos existentes | Alta | Alto | Evaluar si conviene ahora o esperar; backup de config |
| MUI 9 requiere licencia comercial | Baja | Medio | Evaluar alternativa open-source (Radix + Tailwind) |
| `middleware.ts` → `proxy.ts` rompe protección de rutas | Media | Alto | Testear rutas protegidas tras el rename |
| Turbopack build difiere de webpack | Media | Medio | Validar build completo + runtime en dev |
| **Llave privada RS256 filtrada** (repo, bundle, logs) | Baja | **Crítico** | `JWT_PRIVATE_KEY` solo en backend (`.env`/Docker secrets/Railway); nunca en frontend ni repos; `.gitignore` PEM; rotación de llaves documentada |

---

## 9. Observabilidad

- Registrar en `docs/tarea/` el avance de cada fase.
- Después de cada fase, ejecutar `npm outdated` y `npm audit` y documentar el resultado en este spec (actualizar estado a `implementado` al terminar).

---

## 10. Glosario

| Término | Significado |
| --- | --- |
| **CVE** | Common Vulnerabilities and Exposures — identificador de vulnerabilidad conocida. |
| **Flat config** | Nuevo sistema de configuración de ESLint 9+ (`eslint.config.mjs`), reemplaza `.eslintrc`. |
| **HS256** | Firma simétrica JWT: el mismo secreto firma y valida. Si el secreto se filtra, cualquiera puede forjar tokens. |
| **RS256** | Firma asimétrica JWT: llave privada firma, llave pública verifica. Robar la pública NO permite forjar tokens. |
| **Major / Minor / Patch** | Niveles de versionado semántico (X.Y.Z). Major = breaking changes. |
| **Transitiva** | Dependencia de una dependencia (no declarada directamente en `package.json`). |

---

## 11. Referencias

- [[SPEC-001-migracion-monolito-modular]] — arquitectura hexagonal de `backend-portaqr/`.
- [[SPEC-002-qr-multilink-imagen]] — feature de imágenes en qr-app.
- `qr-app/package.json` — dependencias auditadas.
- Next.js upgrade guide: https://nextjs.org/docs/app/building-your-application/upgrading
- ESLint migration: https://eslint.org/docs/use/configure/migration-guide
- Tailwind v4 upgrade: https://tailwindcss.com/docs/upgrade-guide
- React 19: https://react.dev/blog/2024/12/05/react-19