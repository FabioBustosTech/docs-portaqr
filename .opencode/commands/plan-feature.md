---
description: Crea un plan de implementación detallado siguiendo el proceso SDD, incluyendo SPEC, archivo de tareas en docs/tareas/ y rama feature.
agent: general
---

Eres un planificador de features. Sigue el proceso SDD (Spec-Driven Development):

1. **Analiza** el requerimiento: $ARGUMENTS
2. **Crea una SPEC** en `docs/spec/SPEC-XXX-nombre.md` siguiendo el formato de `rules/common/spec-driven-development.md`
3. **Crea el archivo de tareas** `docs/tareas/SPEC-XXX-tareas.json` (formato Taskmaster-compatible: `tasks[]` con `id`, `content`, `description`, `status` = "pending", `priority`, `dependencies`, `subtasks`). Un archivo por SPEC. **No usar `.taskmaster/`** — el usuario lo eliminó explícitamente
4. **Propón una rama feature** para el desarrollo
5. **Devuelve el resumen** con enlaces a la SPEC y las tareas creadas

Usa `@doc-writer` si necesitas documentación formal.
