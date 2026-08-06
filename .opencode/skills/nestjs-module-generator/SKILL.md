# Skill: NestJS Module Generator

Genera módulos completos de NestJS con arquitectura hexagonal usando el script `generate-module.js`.

## Uso

Esta skill se usa cuando el usuario quiere crear un nuevo módulo NestJS en el backend.

### Sintaxis

```
@skill nestjs-module-generator <nombre-modulo>
```

o

```
@skill nestjs-module-generator <schema-file.json>
```

## Workflow

### Paso 1: Identificar el tipo de generación

**Opción A: Módulo genérico**
- El usuario proporciona solo un nombre: `producto`, `cliente`, `orden`
- Se genera un módulo con campos por defecto: `nombre`, `descripcion`, `activa`

> **Regla de aislamiento**: Ejecuta este script SOLO en el entorno de desarrollo que se te indique (desarrollo/, desarrollo2/ o desarrollo3/). No ejecutes el script en otro entorno.

**Opción B: Módulo con schema JSON**
- El usuario proporciona un archivo: `producto.json`
- Requiere que exista `schemas/<nombre>.json` en el backend

**IMPORTANTE**: Antes de ejecutar, identifica el entorno de desarrollo activo. Usa la ruta correspondiente:

| Entorno | Ruta del backend |
|---------|-----------------|
| `desarrollo/` | `desarrollo/venta-entradas-v2-backend` |
| `desarrollo2/` | `desarrollo2/proyecto-venta-entrandas-v2-backend` |
| `desarrollo3/` | `desarrollo3/backend` |

### Paso 2: Ejecutar el script

```bash
cd <ruta-del-backend-según-entorno>
npm run module -- <nombre>
```

o con schema:

```bash
cd <ruta-del-backend-según-entorno>
npm run module -- <nombre>.json
```

### Paso 3: Verificar la generación

1. Confirmar que la carpeta `src/modules/<nombre>/` fue creada
2. Verificar que `app.module.ts` fue actualizado
3. Ejecutar `npm run build` para compilar
4. Ejecutar `npm test` para verificar tests

## Schema JSON

Para campos personalizados, crear `schemas/<nombre>.json`:

```json
{
  "modulo": "<nombre>",
  "campos": [
    {
      "nombre": "nombreCampo",
      "tipo": "string|number|boolean|date",
      "requerido": true|false,
      "maxLength": 100,
      "default": "valor"
    }
  ]
}
```

### Tipos soportados

| Tipo | Decorador DTO | Tipo MongoDB |
|------|---------------|--------------|
| `string` | `@IsString()`, `@MaxLength()` | `String` |
| `number` | `@IsNumber()` | `Number` |
| `boolean` | `@IsBoolean()` | `Boolean` |
| `date` | `@IsDate()` | `Date` |

## Estructura generada

```
src/modules/<nombre>/
├── domain/
│   ├── constants/<nombre>.tokens.ts
│   ├── entities/<nombre>.entity.ts
│   ├── exceptions/<nombre>.error.ts
│   ├── ports/
│   │   ├── <nombre>-repository.port.ts
│   │   └── queries/
│   │       ├── get-<nombre>.port.ts
│   │       └── create-<nombre>.port.ts
│   └── validators/<nombre>-validation.rules.ts
├── application/
│   ├── dto/
│   │   ├── create-<nombre>.dto.ts
│   │   ├── pagination.dto.ts
│   │   └── update-<nombre>.dto.ts
│   ├── services/<nombre>-validator.service.ts
│   └── use-cases/
│       ├── create-<nombre>.usecase.ts
│       ├── delete-<nombre>.usecase.ts
│       ├── get-<nombre>.usecase.ts
│       ├── get-all-<nombre>.usecase.ts
│       └── update-<nombre>.usecase.ts
├── infrastructure/
│   ├── adapters/<Nombre>RepositoryAdapter.ts
│   └── repository/mongo/
│       ├── mongo-<nombre>.repository.ts
│       ├── mappers/<nombre>.mapper.ts
│       └── schemas/<nombre>.schema.ts
├── presentation/
│   ├── controllers/<nombre>.controller.ts
│   └── graphql/
│       ├── <nombre>.resolver.ts
│       └── <nombre>.mutation.resolver.ts
└── <nombre>.module.ts
```

## Archivos de test generados

- `domain/entities/<nombre>.entity.spec.ts`
- `infrastructure/repository/mongo/mongo-<nombre>.repository.spec.ts`
- `application/services/<nombre>-validator.service.spec.ts`
- `application/use-cases/*.usecase.spec.ts` (5 archivos)
- `application/dto/pagination.dto.spec.ts`
- `domain/exceptions/<nombre>.error.spec.ts`
- `<nombre>.module.spec.ts`
- `presentation/controllers/<nombre>.controller.spec.ts`
- `presentation/graphql/<nombre>.resolver.spec.ts`

## Tokens de inyección

```
<NOMBRE>_REPOSITORY
<NOMBRE>_GET_ALL_PORT
<NOMBRE>_GET_PORT
<NOMBRE>_CREATE_PORT
<NOMBRE>_UPDATE_PORT
<NOMBRE>_DELETE_PORT
<NOMBRE>_VALIDATOR
```

## Notas

- El script agrega automáticamente el módulo a `app.module.ts`
- Si el módulo ya existe, no lo duplica
- Los archivos de test son básicos y pueden requerir ampliarlos
- El script está en `scripts/generate-module.js` del backend (ruta según el entorno activo)