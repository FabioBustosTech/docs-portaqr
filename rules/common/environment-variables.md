# Variables de Entorno (.env)

Regla **obligatoria** para cualquier agente que agregue, modifique o elimine variables de entorno en cualquiera de los proyectos (`qr-app`, `backend-portaqr`, `qr-cms`, `e2e-tests-portaqr`).

## Principio rector

**Toda variable de entorno nueva debe documentarse en el `.env.example` del proyecto correspondiente, en el mismo commit en que se introduce.** El `.env.example` es la fuente de verdad de qué variables existen y cómo usarlas. Un `.env.example` desactualizado es un bug de documentación.

## Reglas

### 1. Toda variable nueva va al `.env.example`

- Al agregar una variable de entorno en el código, **agrégala también al `.env.example`** del proyecto, en el mismo commit.
- El `.env.example` debe reflejar **todas** las variables que el proyecto puede leer, aunque sean opcionales.
- Si la variable es sensible (secretos, llaves, tokens), usa un **placeholder** en el `.env.example` (ej. `your_secret_here`), **nunca** el valor real.

### 2. Documentación de cada variable

Cada variable en el `.env.example` debe ir acompañada de un comentario que ayude a comprenderla. Incluye lo que sea útil:

- **Qué hace** la variable (propósito).
- **Valores aceptados** (ej. `true`/`false`, rango numérico, enum, formato).
- **Dónde se usa** (archivo/módulo, si es relevante).
- **Dependencias** (ej. "debe coincidir con X del backend").
- **Restricciones** (ej. "es NEXT_PUBLIC_* → se inlinea en build time, requiere rebuild").
- **Ejemplo** de valor válido.

Formato sugerido:

```dotenv
# <QUÉ HACE la variable>
# Valores aceptados: <valores>
# Uso: <dónde se usa / dependencias / restricciones>
# Ejemplo: <valor de ejemplo>
VARIABLE=valor_por_defecto
```

### 3. Agrupar por sección

- Agrupa las variables relacionadas bajo un comentario de sección (ej. `# ---------- SPEC-XXX: Nombre ----------`).
- Mantén el orden lógico: autenticación, URLs, features, logs, etc.

### 4. Prefijos `NEXT_PUBLIC_*`

- Las variables `NEXT_PUBLIC_*` se **inlinean en build time** en el cliente. Documenta esta restricción y que requieren rebuild al cambiar.
- Las variables **server-side** (sin prefijo) no deben exponerse al cliente.

### 5. No commitear secretos

- **Nunca** commitees `.env` reales ni valores sensibles.
- El `.env.example` solo contiene placeholders para secretos.
- Verifica que los `.env` reales estén en `.gitignore`.

## Checklist

- [ ] Variable nueva agregada al `.env.example` en el mismo commit
- [ ] Comentario con qué hace, valores aceptados, uso y ejemplo
- [ ] Agrupada en su sección correspondiente
- [ ] Secretos con placeholder, no valores reales
- [ ] `.env` reales no commiteados