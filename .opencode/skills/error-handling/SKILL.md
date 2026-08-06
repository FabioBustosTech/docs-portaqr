---
name: error-handling
description: Patrones para manejo robusto de errores en TypeScript. Incluye errores tipados, Result Pattern, Error Boundaries, retry con exponential backoff y mensajes de error para el usuario.
---

# Error Handling

## When to Activate
- Diseñando jerarquías de errores para un nuevo módulo
- Agregando retry logic para dependencias externas
- Revisando endpoints que faltan manejo de errores
- Implementando mensajes de error para el usuario
- Debugging de fallos en cascada o errores silenciosos

## Core Principles
1. **Fail fast and loudly** — los errores se surferean en la frontera donde ocurren
2. **Errores tipados sobre strings** — los errores son valores de primera clase
3. **User messages ≠ developer messages** — texto amigable al usuario, contexto completo en logs
4. **Nunca tragar errores** — todo catch debe handlear, re-throw o loguear
5. **Errores son parte del contrato API** — documentar cada código de error

## Jerarquía de Errores Tipados

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: { field: string; message: string }[]) {
    super(message, 'VALIDATION_ERROR', 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(reason = 'Authentication required') {
    super(reason, 'UNAUTHORIZED', 401);
  }
}
```

## Result Pattern

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

## API Error Handler (Next.js)

```typescript
function handleApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.issues } },
      { status: 422 },
    );
  }
  console.error('Unexpected error:', error);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 },
  );
}
```

## React Error Boundary

```typescript
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
```

## Retry con Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500 } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

## User-Facing Error Messages

```typescript
const USER_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'El recurso solicitado no existe.',
  UNAUTHORIZED: 'Inicia sesión para continuar.',
  VALIDATION_ERROR: 'Revisa los datos ingresados.',
  RATE_LIMITED: 'Demasiadas solicitudes. Espera un momento.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Intenta nuevamente.',
};
```

## Checklist
- [ ] Todo catch handlea, re-throw o loguea
- [ ] Errores API siguen formato `{ error: { code, message } }`
- [ ] Mensajes al usuario sin stack traces
- [ ] Error context completo en logs server-side
- [ ] Clases de error extienden AppError con code
