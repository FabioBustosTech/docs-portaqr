---
name: database-migrations
description: Mejores prácticas para migraciones de base de datos, cambios de schema, rollbacks y despliegues zero-downtime para MongoDB y PostgreSQL.
---

# Database Migrations

## When to Activate
- Creando o alterando tablas/colecciones
- Agregando/removiendo campos o índices
- Planificando cambios de schema sin downtime
- Configurando migraciones en un proyecto nuevo

## Core Principles
1. **Todo cambio es una migración** — nunca alterar producción manualmente
2. **Migrations son forward-only** — rollbacks usan nuevas migraciones
3. **Schema y datos separados** — nunca mezclar DDL y DML en una migración
4. **Migrations inmutables** — nunca editar una migración ya desplegada

## Migración Segura: Expand-Contract

Para cambios sin downtime:

```
Fase 1: EXPAND → Agregar nuevo campo (nullable)
Fase 2: MIGRATE → Backfill datos, app escribe en ambos
Fase 3: CONTRACT → App solo lee new, dropear old
```

## MongoDB (Mongoose)

### Crear una migración

```typescript
// migrations/001-add-slug-to-events.ts
import { getDb } from '../database';

export async function up(): Promise<void> {
  const db = await getDb();
  // Agregar campo
  await db.collection('events').updateMany(
    { slug: { $exists: false } },
    { $set: { slug: null } }
  );
  // Crear índice
  await db.collection('events').createIndex(
    { slug: 1 },
    { unique: true, partialFilterExpression: { slug: { $ne: null } } }
  );
}

export async function down(): Promise<void> {
  const db = await getDb();
  await db.collection('events').dropIndex('slug_1');
  await db.collection('events').updateMany(
    {},
    { $unset: { slug: '' } }
  );
}
```

### Data Migration (backfill)

```typescript
// migrations/002-backfill-slugs.ts
import { getDb } from '../database';

export async function up(): Promise<void> {
  const db = await getDb();
  const BATCH_SIZE = 100;
  let processed = 0;

  const cursor = db.collection('events').find(
    { slug: null },
    { batchSize: BATCH_SIZE }
  );

  while (await cursor.hasNext()) {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE && await cursor.hasNext(); i++) {
      batch.push(await cursor.next());
    }

    const operations = batch.map(event => ({
      updateOne: {
        filter: { _id: event._id },
        update: { $set: { slug: generateSlug(event.nombre) } },
      },
    }));

    if (operations.length > 0) {
      await db.collection('events').bulkWrite(operations);
      processed += operations.length;
      console.log(`Procesados ${processed} eventos`);
    }
  }
}
```

## PostgreSQL

```sql
-- Buena: columna nullable, sin lock
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- Buena: columna con default (Postgres 11+ es instantáneo)
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Mala: NOT NULL sin default (lockea la tabla)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL;

-- Índice sin downtime
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
```

## Migration Safety Checklist
- [ ] Migration tiene UP y DOWN
- [ ] Sin full table locks en tablas grandes
- [ ] Nuevas columnas: nullable o con default
- [ ] Índices creados concurrentemente
- [ ] Data backfill separado de schema change
- [ ] Probado contra copia de producción
- [ ] Rollback plan documentado
