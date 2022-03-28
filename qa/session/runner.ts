import { test, expect } from '@playwright/test';

import { redis } from 'redis'
import { waitPort }  from 'wait-port'


    const local = process.env.LOCALDEV !== undefined,
          url = local?"http://localhost:3000":"http://terminal7"
test.describe('feature foo', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the starting url before each test.
    await page.goto('https://playwright.dev/');
  });

  test('my test', async ({ page }) => {
    // Assertions use the expect API.
    await expect(page).toHaveURL('https://playwright.dev/');
  });
});
