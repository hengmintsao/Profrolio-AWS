import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const sharp = createRequire(
  new URL('../backend/package.json', import.meta.url),
)('sharp');

test.beforeEach(async ({ baseURL, page }) => {
  expect(baseURL).toBe('http://127.0.0.1:4174');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('isolated preview enforces the configured host and origin', async ({
  request,
}) => {
  const target = 'http://127.0.0.1:8788/api/public/projects';
  expect(
    (
      await request.get(target, {
        headers: { Origin: 'http://127.0.0.1:4174' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.get(target, { headers: { Origin: 'https://example.com' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(target, { headers: { Host: 'example.com:8788' } })
    ).status(),
  ).toBe(403);
});

test('homepage images and section navigation work in a rendered browser', async ({
  page,
  isMobile,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Business insight.',
  );
  await expect
    .poll(() =>
      page
        .locator('.about-portrait')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.locator('.legacy-preview').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator('.legacy-preview img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  if (isMobile) {
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeHidden();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Close', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
  }
  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/#about$/);
  await expect
    .poll(() =>
      page
        .locator('#about')
        .evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    )
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(() =>
      page
        .locator('#about')
        .evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    )
    .toBeLessThan(60);
  if (isMobile) {
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeHidden();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('link', { name: 'Work', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Menu', exact: true }),
    ).toBeFocused();
  }
  await page
    .locator('#about')
    .screenshot({ path: testInfo.outputPath('about.png') });
  expect(errors).toEqual([]);
});

test('public and editor pages fit narrow, tablet and landscape viewports', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 402, height: 874 },
    { width: 440, height: 956 },
    { width: 768, height: 1024 },
    { width: 852, height: 393 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of [
      '/',
      '/experience/airline-revenue',
      '/contact',
      '/admin/projects/new',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - window.innerWidth,
            ),
          { message: `Horizontal overflow at ${viewport.width}px on ${path}` },
        )
        .toBeLessThanOrEqual(1);
      if (path === '/' && viewport.width === 390)
        await page.screenshot({
          path: testInfo.outputPath('home-390.png'),
          fullPage: true,
        });
    }
  }
});

for (const path of [
  '/',
  '/experience/airline-revenue',
  '/contact',
  '/admin/projects/new',
]) {
  test(`WCAG accessibility scan: ${path}`, async ({ page }, testInfo) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByText('Loading projects…', { exact: true }),
    ).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await testInfo.attach('accessibility-results', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
    expect(results.violations).toEqual([]);
  });
}

test('project service errors retain the earlier project entry', async ({
  page,
}) => {
  await page.route('**/api/public/projects', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'Isolated failure fixture.' },
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText(
    'Project case studies are temporarily unavailable.',
  );
  await expect(
    page.getByRole('heading', { name: 'Airline-Point Website' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Airline-Point Website (new tab)' }),
  ).toHaveAttribute('href', 'https://airline-point-website.vercel.app/');
});

test('isolated owner can upload, save, preview, publish, edit, trash and restore', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(60000);
  expect((await request.get('/api/admin/projects')).status()).toBe(401);
  const slug = `e2e-${randomUUID()}`,
    title = `Browser fixture ${slug}`;
  const image = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#a44320' },
  })
    .png()
    .toBuffer();
  await page.goto('/admin/projects/new');
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Slug', { exact: false }).fill(slug);
  await page
    .getByLabel('Summary', { exact: true })
    .fill('Disposable browser-test project; never production data.');
  await page.getByLabel('Cover image', { exact: true }).setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: image,
  });
  await expect(page.getByRole('status')).toContainText('Image verified');
  await page
    .getByLabel('Cover alternative text', { exact: true })
    .fill('Orange test square');
  await page.getByRole('button', { name: '+ Paragraph', exact: true }).click();
  await page
    .getByLabel('Paragraph text', { exact: true })
    .fill('Verified content for an isolated browser test.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/[^/]+\/edit$/);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
  await expect(
    page.getByRole('button', { name: 'Preview saved draft', exact: true }),
  ).toBeEnabled();
  const id = new URL(page.url()).pathname.split('/')[3];
  const saved = await request.get(`/api/admin/projects/${id}`, {
    headers: { Authorization: 'Bearer local-owner' },
  });
  expect(saved.status()).toBe(200);
  const savedProject = (await saved.json()).project;
  expect(savedProject.draft.title).toBe(title);
  expect(savedProject.draft.coverMediaId).toBeTruthy();
  expect((await request.get(`/api/public/projects/${slug}`)).status()).toBe(
    404,
  );
  await page
    .getByRole('button', { name: 'Preview saved draft', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await page
    .getByRole('button', { name: '← Back to editor', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Publish saved version', exact: true })
    .click();
  await page
    .getByRole('region')
    .getByRole('button', { name: 'Confirm action', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Publication confirmed');
  const published = await request.get(`/api/public/projects/${slug}`);
  expect(published.status()).toBe(200);
  expect((await published.json()).project.title).toBe(title);
  const publicPage = await context.newPage();
  await publicPage.goto(`/projects/${slug}`);
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect
    .poll(() =>
      publicPage
        .getByRole('img', { name: 'Orange test square' })
        .evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await publicPage.close();
  await page.getByLabel('Title', { exact: true }).fill(`Edited ${title}`);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  expect(
    (await (await request.get(`/api/public/projects/${slug}`)).json()).project
      .title,
  ).toBe(title);
  await page
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await page
    .getByRole('region')
    .getByRole('button', { name: 'Confirm action', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Restore project', exact: true }),
  ).toBeVisible();
  expect((await request.get(`/api/public/projects/${slug}`)).status()).toBe(
    404,
  );
  await page
    .getByRole('button', { name: 'Restore project', exact: true })
    .click();
  await page
    .getByRole('region')
    .getByRole('button', { name: 'Confirm action', exact: true })
    .click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    `Edited ${title}`,
  );
  expect((await request.get(`/api/public/projects/${slug}`)).status()).toBe(
    404,
  );
});
