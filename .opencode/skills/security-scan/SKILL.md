---
name: security-scan
description: Auditoría de seguridad OWASP Top 10 para backend y frontend. Revisión de vulnerabilidades, autenticación, autorización y configuraciones.
---

# Security Scan

## When to Activate
Usa esta skill al realizar auditorías de seguridad o code review enfocado en seguridad.

## Áreas de Revisión

### Autenticación
- JWT: verificar firma, expiración, httpOnly cookies
- OAuth: state parameter, CSRF, redirect_uri validation
- Rate limiting en endpoints de auth

### Autorización
- CASL abilities correctamente configurados
- Guards en endpoints REST y resolvers GraphQL
- Validación por rol/permiso

### OWASP Top 10
1. Broken Access Control
2. Cryptographic Failures
3. Injection (SQL, NoSQL, XSS)
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable and Outdated Components
7. Identification and Authentication Failures
8. Software and Data Integrity Failures
9. Security Logging and Monitoring Failures
10. Server-Side Request Forgery

## Checklist
- [ ] Cookies httpOnly + Secure + SameSite
- [ ] CSP configurado
- [ ] Rate limiting en auth
- [ ] Input validation en todos los endpoints
- [ ] Errores sanitizados
