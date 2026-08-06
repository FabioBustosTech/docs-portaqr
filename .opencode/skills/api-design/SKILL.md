---
name: api-design
description: Patrones de diseño REST API incluyendo naming de recursos, status codes, paginación, filtrado, errores, versionado y rate limiting.
---

# API Design

## When to Activate
- Diseñando nuevos endpoints API
- Revisando contratos API existentes
- Agregando paginación, filtrado o sorting
- Planificando estrategia de versionado
- Construyendo APIs públicas

## Resource Design

```
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id

POST   /api/v1/orders/:id/cancel
POST   /api/v1/auth/login

# kebab-case para multi-word
/api/v1/team-members
```

## HTTP Status Codes

```
200 OK          — GET, PATCH con body
201 Created     — POST (incluir Location header)
204 No Content  — DELETE
400 Bad Request — Validación
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict    — Duplicado, estado conflictivo
422 Unprocessable Entity
429 Too Many Requests
```

## Response Format

```typescript
// Success
{
  "data": { "id": "abc-123", "email": "user@example.com" }
}

// Collection con paginación
{
  "data": [...],
  "meta": { "total": 142, "page": 1, "per_page": 20, "total_pages": 8 },
  "links": { "self": "...", "next": "...", "last": "..." }
}

// Error
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed",
    "details": [{ "field": "email", "message": "Must be valid email", "code": "invalid_format" }]
  }
}
```

## Paginación

Offset-based (simple, jump to page):
```
GET /api/v1/users?page=2&per_page=20
```

Cursor-based (escalable, infinite scroll):
```
GET /api/v1/users?cursor=eyJpZCI6MTIzfQ&limit=20
```

## Filtering, Sorting, Search

```
# Filtering
GET /api/v1/orders?status=active&price[gte]=10

# Sorting (- para descendente)
GET /api/v1/products?sort=-created_at

# Search
GET /api/v1/products?q=wireless+headphones
```

## Rate Limiting Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## Checklist
- [ ] URLs: plural, kebab-case, sin verbos
- [ ] HTTP methods correctos
- [ ] Status codes apropiados (no 200 para todo)
- [ ] Input validado con Zod/class-validator
- [ ] Errores con formato estándar
- [ ] Paginación en list endpoints
- [ ] Rate limiting configurado
- [ ] Sin leaks de info interna
