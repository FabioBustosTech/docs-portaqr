---
title: "SPEC-029: Link de calificaciones y reseñas en QR Multilink"
date: 2026-09-03
tags:
  - spec
  - feature
  - frontend
  - qr
  - multilink
  - resenas
status: implementado
aliases:
  - SPEC-029
  - Reseñas QR Multilink
  - Link calificaciones negocios
---

# SPEC-029: Link de calificaciones y reseñas en QR Multilink

> [!abstract] Decisión clave
> Agregar el tipo **"Reseñas"** (`id: 'reviews'`) a los items del QR multilink (`typeQr: 'list'`) como **enlace externo** a la ficha de calificaciones del negocio (Google Maps/review, `g.page`, TripAdvisor, Yelp, Facebook reviews). Es un cambio **solo frontend** (`qr-app/`): el backend ya acepta cualquier `typeUrl` string con `url` https, por lo que no requiere cambios en `backend-portaqr/`. La landing pública muestra un **call to action atractivo** en vez del botón genérico: 5 estrellas + **"Déjanos una reseña"** + bajada "Tu opinión nos ayuda a mejorar", en ámbar.

> [!info] Metadatos
> - **Estado:** Implementado el **2026-09-03** (tsc + eslint limpios; suite frontend **71 suites / 535 tests verdes**; build de producción local verificado con `Reseñas` en los chunks servidos en `:3000`)
> - **Fecha:** 2026-09-03
> - **Autor:** Equipo Plataforma QR
> - **Componentes afectados:** `qr-app/` (puerto 3000). Sin cambios en `backend-portaqr/`
> - **Alcance:** Solo QR tipo `list` (multilink). No aplica a `dynamic`, `static`, `whatsapp`, `email`, `call`, `wifi`, `texto`, `vcard`, `pet`, `phone`, `map`
> - **Página pública destino:** `https://portaqr.cl/qr/{idQr}`
> - **Relacionado:** [[SPEC-002-qr-multilink-imagen]], [[SPEC-005-pdf-multilink]], [[SPEC-022-title-pdf-multilink]]
> - **Caso de uso origen:** ficha Google Maps de "Dementes Publicidad" (`google.com/maps/place/Dementes+Publicidad/...`)

---

## 1. Objetivo

Permitir que cada QR **multilink** tenga uno o más enlaces a sus **calificaciones y reseñas externas**, para que el cliente que escanea llegue en un toque a dejar una opinión (Google es el caso principal en Chile; también TripAdvisor, Yelp y reviews de Facebook).

### 1.1 Beneficios buscados

| Beneficio | Estado anterior | Tras SPEC-029 |
| --- | --- | --- |
| Link a reseñas del negocio | Solo como "Google maps" genérico (botón rojo de ubicación) | CTA propio: 5 estrellas + "Déjanos una reseña" (botón ámbar) |
| Autodetección al pegar | Links con `/review`, `g.page`, TripAdvisor, Yelp se clasificaban como otro tipo | Se clasifican como Reseñas automáticamente |
| Resumen en dashboard | Mostraba el dominio crudo del link | Muestra `Reseñas: dominio...` |
| Cambios backend | n/a | Ninguno (reutiliza validación genérica de URL) |

### 1.2 Out of scope (no incluido)

- **Sistema propio de calificaciones** (estrellas + comentarios guardados en el backend y mostrados en la landing): se evaluó con el usuario y se **descartó** — pidió enlace externo (ver ADR-029.1).
- Acortador de URLs largas de Google Maps.
- Límite de items de reseñas por QR (a diferencia de los PDF de SPEC-005, no hay límite).
- Moderación o agregación de reseñas (las reseñas viven en la plataforma externa).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

#### Registro del tipo

- **RF-1**. Nueva entrada en `socialConst` (`qr-app/src/constants/social.const.ts`):
  ```ts
  {
    id: 'reviews',
    name: 'Reseñas',
    icon: Icon({ name: 'reviews' }),
    baseUrl: '',
    pattern: /(review|rating|\/rate|reseñ|resen|calific|opini|tripadvisor\.|yelp\.|g\.page)/i
  }
  ```
  La entrada va **ANTES de `'google maps'`**: un link de Maps con intención de reseña (`g.page`, `.../review`, TripAdvisor...) se clasifica como Reseñas; un Maps puro (ficha/ubicación sin keyword de reseña) sigue siendo Google maps.
- **RF-2**. Nuevo icono estrella `src/components/icon/reviews.tsx` (SVG `fill="currentColor"`), registrado como `reviews` en `src/components/icon/index.tsx` (mismo patrón que `pdf.tsx`).

#### Creación / edición (dashboard)

- **RF-3**. El `Select` de tipo de enlace (`ListUrlRow.tsx`, itera `socialTypes`) incluye **Reseñas**. La **selección manual manda**: aunque el pegado autodetecte otro tipo, el usuario puede elegir Reseñas (y viceversa).
- **RF-4**. `detectUrlType` (`ListUrlForm.helpers.ts`) no requiere cambios de lógica: `reviews` no está en la lista de exclusión (`web`, `blog`, `map`, `whatsapp`, `email`, `phone`), por lo que participa del loop en orden y **gana a `google maps`** cuando ambos patrones matchean.
- **RF-5**. `extractRelevantUrl` devuelve la **URL completa** para `type === 'reviews'` (agregando `https://` si falta protocolo), igual que `google maps`: los links de reseña no se mutilan extrayendo "username".
- **RF-6**. Placeholder del input en `ListUrlRow.tsx` para `reviews`: `https://g.page/tu-negocio/review…`.
- **RF-7**. Persistencia sin cambios de modelo: `buildUrlList` guarda `{ url: <formateada>, typeUrl: 'Reseñas' }` (el `name` del catálogo, igual que todos los tipos). `useListUrlSync` lo mapea de vuelta por `name → id` (`socialTypes.find(s => s.name === item.typeUrl)?.id`), por lo que la edición round-trip funciona sin tocar el sync.

#### Página pública (`UrlList.tsx`)

- **RF-8**. Helper `isReviewType(type)` (fuente única): `'reviews'` y variantes en español (`Reseñas`, `reseñas`, `Reseña`, `reseña`, `Calificaciones`, `calificaciones`, con/sin tilde) → reseña. Lo usan el CTA (RF-13) y `getDisplayName` (fallback → **"Reseñas"**).
- **RF-9**. Color ámbar **`bg-amber-500 hover:bg-amber-600`** para el CTA (estrella/calificación; evita colisión con `google maps` rojo `bg-red-500` y `pdf` rosa `bg-rose-600`), con sombra y leve elevación en hover.
- **RF-10**. `getDisplayName`: `isReviewType` → label fijo **"Reseñas"** (fallback; el CTA de RF-13 lo reemplaza en la práctica).

- **RF-13 (CTA)**. Todo item reseña **con `url`** se renderiza como call to action (rama propia antes del botón genérico, mismo patrón que el item PDF de SPEC-005):
  - Fila de **5 estrellas** SVG (`aria-hidden`, mismo path del icono `reviews`).
  - Título **"Déjanos una reseña"** (`text-lg font-semibold`, `aria-label` del ancla).
  - Bajada **"Tu opinión nos ayuda a mejorar"** (`text-xs text-white/90`).
  - Ancla con `href`, `target="_blank"`, `rel="noopener noreferrer"`; key estable `itemId` (fallback `reviews-<url>`).
  - Reseña **sin `url` no se renderiza** (sin botón roto, mismo criterio que PDF sin `documentUrl`).

- **RF-14 (ancho consistente)**. Raíz de `UrlList`: `max-w-lg mx-auto w-full`. Sin `w-full`, el padre (`QrRedirectClient`: `flex flex-col items-center`) y el body (`flex flex-col` en `app/layout.tsx`) encogen el contenedor al contenido (shrink-to-fit): el ancho variaba por QR (444 con nombre largo vs 234 sin nombre). Con `w-full` siempre llena los 512 de `max-w-lg`.

#### Dashboard (resumen)

- **RF-11**. `qr-content-summary.ts` (`formatListItem`): items con `typeUrl` `reviews`/`reseñas`/`reseña`/`calificaciones` → `Reseñas: <dominio>` (o `'Reseñas'` sin URL), en vez del dominio crudo.

#### Backend

- **RF-12**. **Sin cambios.** `ListUrlData.url` acepta cualquier `https://` (`@Matches(/^((https?:\/\/[^\s]+|tel:...))$/)`) y `typeUrl` es string libre; el validador del schema (`case 'list'`, rama genérica) exige `url` y prohíbe `vcard`/`documentUrl`, que es exactamente la forma del item Reseñas.

### 2.2 Criterios de aceptación (CA)

- **CA-01**. Pegar `https://g.page/mi-cafe/review` en una fila autodetecta tipo Reseñas.
- **CA-02**. Pegar `https://www.tripadvisor.cl/Restaurant_Review-xyz` autodetecta Reseñas.
- **CA-03**. Pegar `https://www.google.com/maps/place/Cafe` (sin keyword de reseña) sigue siendo Google maps.
- **CA-04**. Pegar `https://www.google.com/maps/place/Cafe/review` es Reseñas (gana a maps por orden).
- **CA-05**. El link real de "Dementes Publicidad" (`.../place/Dementes+Publicidad/@...`) se puede cargar eligiendo manual Reseñas; la variante con sufijo `/reviews?hl=es` autodetecta sola.
- **CA-06**. Crear y editar QR multilink con item Reseñas persiste y recarga sin perder el tipo (round-trip `Reseñas ↔ reviews`).
- **CA-07**. La landing muestra el CTA ámbar (5 estrellas + "Déjanos una reseña" + bajada) que abre el link en pestaña nueva.
- **CA-08**. `npx tsc --noEmit` limpio, `eslint` limpio en archivos tocados, suite `jest` completa verde (71/535 a la fecha de implementación).
- **CA-09 (CTA)**. Item reseña con url → ancla `target="_blank"` con nombre accesible "Déjanos una reseña", 5 `<svg>` y bajada visible; `typeUrl` `'reviews'` y `'Reseñas'` dan el mismo CTA; sin url no hay CTA (solo queda el link del footer).

---

## 3. Decisiones de diseño (con ADR embebido)

### 3.1 ADR-029.1 — Enlace externo vs sistema propio de reseñas

> [!question] Contexto
> El usuario pidió "el link de calificaciones y reseñas de negocios" para el multilink. ¿Enlace a plataformas externas o sistema propio con estrellas y comentarios en `portaqr.cl/qr/{id}`?

> [!tip] Alternativas consideradas
> - **A)** Enlace externo a la ficha de reseñas (Google/TripAdvisor/Yelp/Facebook). Pros: cero backend, las reseñas agregan SEO/social-proof donde ya están los clientes, sin moderación. Contras: el tráfico sale de PortaQR. ✅ (elegida por el usuario)
> - **B)** Sistema propio (estrellas + comentarios en Mongo, form en la landing). Pros: contenido propio, engagement en la página. Contras: requiere modelo, endpoints, moderación anti-spam, notificaciones; duplica lo que Google ya hace bien.
> - **C)** Ambos (enlace ahora, sistema propio después). Se deja como trabajo futuro si se pide.

> [!success] Decisión
> **Alternativa A.** El usuario confirmó "Enlace externo a reseñas".

### 3.2 ADR-029.2 — Orden del pattern antes de `google maps`

> [!question] Contexto
> `detectUrlType` itera `socialConst` en orden y el primer match gana. Un link `google.com/maps/.../review` matchea AMBOS patterns (maps y reviews). ¿Cuál debe ganar?

> [!success] Decisión
> `reviews` va **antes** de `google maps`. La intención de reseña (`review`, `g.page`, dominios de reseñas) es más específica que la ubicación genérica. Un Maps sin keyword sigue cayendo en maps. La selección manual siempre puede corregir.

### 3.3 ADR-029.3 — Frontend-only, sin cambios backend

> [!question] Contexto
> ¿Hay que extender DTOs/schema como en SPEC-005 (pdf) o SPEC-022 (title)?

> [!success] Decisión
> **Sin cambios.** A diferencia del item PDF (nuevo campo `documentUrl` + exclusividad + límites), Reseñas es un item URL común: `{ url, typeUrl }`. El DTO (`@Matches` https), el schema (rama genérica del `case 'list'`) y el mapper ya lo soportan. Menor riesgo, cero migración.

### 3.4 ADR-029.4 — Color ámbar

> [!question] Contexto
> ¿Qué color distingue a Reseñas sin colisionar con los existentes?

> [!success] Decisión
> **`bg-amber-500`** (estrella/calificación). Rojo ocupado por maps, rosa por pdf, grises/azules por web/email/teléfono. El label queda en blanco sobre ámbar con contraste aceptable para botón grande.

---

## 4. Cambios por capa

### 4.1 Frontend — `qr-app/` (única capa tocada)

| Archivo | Cambio |
| --- | --- |
| `src/components/icon/reviews.tsx` *(nuevo)* | Icono estrella (path Material Star), `fill="currentColor"` |
| `src/components/icon/index.tsx` | Import + registro `reviews:` |
| `src/constants/social.const.ts` | Entrada `reviews`/`Reseñas` + pattern, antes de `google maps` |
| `src/components/qr/UrlList.tsx` | Icono, color ámbar y label "Reseñas" (id + 6 variantes es) |
| `src/components/qr/forms/ListUrlForm.helpers.ts` | `extractRelevantUrl`: URL completa para `reviews` |
| `src/components/qr/forms/ListUrlRow.tsx` | Placeholder `https://g.page/tu-negocio/review…` |
| `src/lib/qr-content-summary.ts` | `formatListItem`: `Reseñas: <dominio>` |

### 4.2 Backend — `backend-portaqr/`

Ninguno (RF-12).

### 4.3 Infra / despliegue (nota de incidente)

Al reiniciar `qr-app` (Docker) para tomar los cambios, el boot (`npm install && build && start`) falló en loop: `npm install` devolvía `ETIMEDOUT` contra `registry.npmjs.org` y `restart: always` lo reiniciaba sin llegar nunca al build. Fix en `desarrollo-qr/docker-compose.yml`: `npm install || true && ...` (continúa con los `node_modules` del volumen; no se agregaron dependencias nuevas, por lo que es seguro) + comentario explicativo. Tras recrear, build OK y contenedor `healthy` con `Reseñas` verificado en los chunks servidos.

---

## 5. Testing

- **Tipos:** `npx tsc --noEmit` limpio.
- **Lint:** `npx eslint` limpio en los 7 archivos tocados.
- **Unitarios/integración frontend:** `npx jest --no-coverage --silent` → **71 suites / 535 tests verdes**, incluidos `UrlList.spec.tsx`, `ListUrlForm.helpers.spec.tsx`, `useListUrlSync.spec.tsx` y `qr-content-summary.spec.ts` (sin regresión).
- **Pattern:** verificación manual de matcheo (review/g.page/tripadvisor/yelp → sí; maps puro e instagram → no).
- **E2E:** no se agregaron (feature de catálogo sin flujo nuevo; la matriz create/edit/pública ya está cubierta). Si se quiere, caso sugerido: pegar `g.page/.../review` → el Select queda en Reseñas.

---

## 6. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Falso positivo del pattern (URL con "opini"/"rating" que no es reseña) | Media | Bajo | La selección manual del Select corrige; el pattern prioriza no romper maps puros |
| Links larguísimos de Google (`entry=ttu&g_ep=...`) | Alta | Bajo | Se aceptan tal cual; se recomienda limpiar params o usar `g.page`/Pedir-reseñas del Perfil de Empresa |
| `npm install` en boot de Docker ante caída del registry | Baja | Alto (app caída en loop) | `npm install \|\| true` en `docker-compose.yml` (incidente 2026-09-03 documentado en §4.3) |
| Items viejos con `typeUrl` en inglés (`reviews`) | Baja | Bajo | `UrlList` y `qr-content-summary` matchean id y variantes es |

---

## 7. Trabajo futuro (out of scope)

- **Sistema propio de calificaciones** (ADR-029.1 alt. B): estrellas + comentarios en Mongo, form en la landing, moderación y notificaciones — solo si el usuario lo pide.
- **Tipo "Publicidad"/promo** separado, si se necesita distinguir promos de reseñas.
- Normalizador de links de Google Maps (limpiar `entry`/`g_ep`, resolver `maps.app.goo.gl` cortos) al pegar.

---

## 8. Historial de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-09-03 | Creación de la spec (documenta implementación ya realizada y validada el mismo día). Se incluye nota del incidente de boot Docker (`npm install \|\| true`). |
| 2026-09-03 | **RF-13 + CA-09 (CTA):** el item reseña con link se renderiza como call to action "Déjanos una reseña" (5 estrellas + bajada) en vez del botón genérico; helper `isReviewType` como fuente única; 3 tests en `UrlList.spec.tsx`. |
| 2026-09-03 | **RF-14 (ancho consistente):** `w-full` en la raíz de `UrlList` — el contenedor se encogía al contenido por flex + `items-center` del padre y el ancho variaba por QR (444 vs 234). |

---

## 9. Referencias

- [[SPEC-002-qr-multilink-imagen]] — patrón de feature multilink solo-portada
- [[SPEC-005-pdf-multilink]] — patrón de item especial en `urlList` (itemId, UI por tipo, landing)
- [[SPEC-022-title-pdf-multilink]] — última spec multilink previa (convenciones de landing y sync)
- Catálogo de tipos: `qr-app/src/constants/social.const.ts`
- Landing: `qr-app/src/components/qr/UrlList.tsx`
- Caso real: ficha "Dementes Publicidad" en Google Maps (link `/place/Dementes+Publicidad/@-35.4295618,-71.6615271`)
