---
name: e2e-testing
description: Patrones de testing E2E con Playwright, Page Object Model, configuración, integración CI/CD y estrategias contra tests flaky.
---

# E2E Testing (Playwright)

## When to Activate
- Creando tests E2E para flujos críticos
- Configurando Playwright en un proyecto nuevo
- Debugging tests flaky
- Integrando E2E en CI/CD

## Estructura de Archivos

```
tests/e2e/
├── auth/
│   ├── login.spec.ts
│   └── register.spec.ts
├── features/
│   ├── browse.spec.ts
│   └── search.spec.ts
└── api/
    └── endpoints.spec.ts
```

## Page Object Model

```typescript
import { Page, Locator } from '@playwright/test';

export class ItemsPage {
  readonly searchInput: Locator;
  readonly itemCards: Locator;

  constructor(public readonly page: Page) {
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.itemCards = page.locator('[data-testid="item-card"]');
  }

  async goto() {
    await this.page.goto('/items');
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForResponse(resp => resp.url().includes('/api/search'));
  }
}
```

## Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { ItemsPage } from '../../pages/ItemsPage';

test.describe('Item Search', () => {
  let itemsPage: ItemsPage;

  test.beforeEach(async ({ page }) => {
    itemsPage = new ItemsPage(page);
    await itemsPage.goto();
  });

  test('should search by keyword', async () => {
    await itemsPage.search('test');
    await expect(itemsPage.itemCards.first()).toContainText(/test/i);
  });
});
```

## Playwright Config

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
```

## Flaky Tests

```typescript
// Quarantine
test('flaky: complex search', async ({ page }) => {
  test.fixme(true, 'Flaky - Issue #123');
});

// Conditional skip
test('conditional skip', async ({ page }) => {
  test.skip(process.env.CI, 'Flaky in CI - Issue #123');
});
```

### Common Causes & Fixes

❌ Mal: `await page.waitForTimeout(5000)`
✅ Bien: `await page.waitForResponse(resp => resp.url().includes('/api/data'))`

❌ Mal: `await page.click('[data-testid="button"]')`
✅ Bien: `await page.locator('[data-testid="button"]').click()` (auto-wait)

## CI/CD Integration

```yaml
# .github/workflows/e2e.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Checklist
- [ ] Page Object Model implementado
- [ ] Tests independientes entre sí
- [ ] Sin waitForTimeout (usar waits específicos)
- [ ] Screenshots solo en fallo
- [ ] Trace en first-retry
- [ ] CI/CD integrado
