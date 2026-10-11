import { test, expect } from '@playwright/test';

for (const width of [1440, 768, 390, 320]) {
  test(`directory and account layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/locations', route => route.fulfill({ json: [
      { id: 101, name: 'Test county', county: 'Test county', location_type: 'county', parent_id: null },
      { id: 102, name: 'Test sub-county', county: 'Test county', location_type: 'sub_county', parent_id: 101 },
      { id: 103, name: 'Test town', county: 'Test county', location_type: 'town', parent_id: 102 }
    ] }));
    // Browser-only fixtures never enter the real database.
    await page.route('**/api/agents?*', route => route.fulfill({ json: {
      items: Array.from({ length: 6 }, (_, index) => ({
        id: index + 1, name: `UI test agent ${index + 1}`, agency_name: null,
        verification_status: 'unverified', review_count: 0, bio: 'Fictional browser test fixture.',
        service_areas: [{ name: 'Nairobi', location_type: 'county' }]
      })), total: 6, total_pages: 1, page: 1
    } }));
    await page.route('**/api/ads?*', route => route.fulfill({ json: [] }));
    await page.route('**/api/agents/*/reviews', route => route.fulfill({ json: [] }));
    await page.goto(process.env.UI_BASE_URL || 'http://localhost:3001');
    await expect(page.locator('.agent-card')).toHaveCount(6);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width > 760) await expect(page.locator('#discovery-filters')).toBeVisible();
    else await expect(page.locator('#discovery-filters')).toBeHidden();
    await expect(page.getByRole('search').locator('input')).toHaveCount(1);
    await page.getByRole('textbox', { name: 'Search agents, agencies or places' }).fill('Nairobi');
    const searchRequest = page.waitForRequest(request => request.url().includes('/api/agents?') && new URL(request.url()).searchParams.get('q') === 'Nairobi');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await searchRequest;
    if (width <= 760) await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('button', { name: 'Test county county', exact: true }).click();
    await page.getByRole('button', { name: 'Test sub-county sub-county', exact: true }).click();
    const drillRequest = page.waitForRequest(request => request.url().includes('/api/agents?') && new URL(request.url()).searchParams.get('location_id') === '103');
    await page.getByRole('button', { name: 'Test town town', exact: true }).click();
    await drillRequest;
    await expect(page.getByText('No more detailed areas listed yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to parent area' }).click();
    await expect(page.getByRole('button', { name: 'Test town town', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width <= 760) await page.getByRole('button', { name: 'Show agents', exact: true }).click();
    await page.getByRole('button', { name: 'Remove location filter' }).click();
    await expect(page.getByRole('heading', { name: 'Sponsored advertisements' })).toHaveCount(0);
    await page.screenshot({ path: `test-results/directory-${width}.png`, fullPage: true });
    await page.getByText('Profile details', { exact: true }).first().click();
    await expect(page.getByText('Fictional browser test fixture.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Agent account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Browse agents' }).click();
    await expect(page.locator('.agent-card')).toHaveCount(6);
  });
}
