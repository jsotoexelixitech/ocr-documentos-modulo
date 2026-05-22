# Guía de contribución

¡Gracias por tu interés en mejorar este módulo! Lee esta guía antes de abrir un PR.

---

## Flujo de trabajo

1. **Fork** el repositorio y crea tu rama desde `main`:
   ```bash
   git checkout -b feat/mi-mejora
   ```

2. **Haz tus cambios** siguiendo las convenciones de código del proyecto.

3. **Escribe o actualiza tests** si aplica.

4. **Actualiza `CHANGELOG.md`** en la sección `[Unreleased]`.

5. **Crea el Pull Request** describiendo el problema y la solución.

---

## Convención de commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/es/):

| Prefijo    | Cuándo usarlo                              |
|:-----------|:-------------------------------------------|
| `feat:`    | Nueva funcionalidad                        |
| `fix:`     | Corrección de bug                          |
| `docs:`    | Solo documentación                         |
| `style:`   | Formato, espacios (sin cambio de lógica)   |
| `refactor:`| Refactorización sin nuevas features ni bugs|
| `test:`    | Añadir o corregir tests                    |
| `chore:`   | Tareas de mantenimiento, dependencias      |

**Ejemplos:**
```
feat: soporte para pasaportes venezolanos
fix: timeout de Gemini aumentado a 30 s
docs: agregar sección de troubleshooting al README
```

---

## Ramas

| Rama      | Propósito                          |
|:----------|:-----------------------------------|
| `main`    | Código estable · productivo        |
| `develop` | Integración de features            |
| `feat/*`  | Nuevas funcionalidades             |
| `fix/*`   | Correcciones de bugs               |
| `hotfix/*`| Fixes urgentes en producción       |

---

## Estilo de código

- **Node.js / TypeScript:** ESLint + Prettier (configuración del proyecto)
- **React:** Componentes funcionales + hooks, sin clases
- No dejes `console.log` sueltos en producción

---

## Reportar bugs

Usa la plantilla de [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md).

## Solicitar features

Usa la plantilla de [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md).

---

## Proceso de revisión

- Se requiere al menos **1 aprobación** para mergear a `main`
- Los PRs deben pasar el CI antes de revisión
- Mantén los PRs pequeños y enfocados (un propósito por PR)
