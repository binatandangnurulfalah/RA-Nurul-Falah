import { expect, test } from '@playwright/test'

function portalUrl(role, page = '') {
  const base = role === 'admin' ? '/admin' : role === 'teacher' ? '/guru' : '/orang-tua'
  const suffix = page ? `/${page}` : ''
  return `?previewRole=${role}#${base}${suffix}`
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test('protected admin route without session returns to login', async ({ page }) => {
  await page.goto('#/admin')
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.getByRole('heading', { name: 'Masuk ke RA Nurul Falah' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('desktop admin navigation updates title and focuses main landmark', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop')

  await page.goto(portalUrl('admin'))
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('.skip-link')).toHaveText('Lewati ke konten utama')
  await expectNoHorizontalOverflow(page)

  await page.locator('.v2-sidebar').getByRole('button', { name: 'Pengaturan' }).click()

  await expect(page).toHaveURL(/#\/admin\/settings$/)
  await expect(page).toHaveTitle('Pengaturan · RA Nurul Falah')
  await expect(page.locator('#main-content')).toBeFocused()
  await expectNoHorizontalOverflow(page)
})

test('mobile menu traps focus, closes with Escape, and restores opener focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')

  await page.goto(portalUrl('admin'))
  const opener = page.locator('.v2-bottom-nav').getByRole('button', { name: 'Lainnya' })
  await expect(opener).toBeVisible()
  await opener.click()

  const dialog = page.getByRole('dialog', { name: 'Menu lainnya' })
  await expect(dialog).toBeVisible()
  const focusedInside = await page.evaluate(() => {
    const dialog = document.querySelector('#mobile-more-menu')
    return Boolean(dialog && dialog.contains(document.activeElement))
  })
  expect(focusedInside).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  await expectNoHorizontalOverflow(page)
})

test('role navigation does not expose finance module to teacher', async ({ page }) => {
  await page.goto(portalUrl('teacher'))
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Pembayaran', { exact: true })).toHaveCount(0)

  await page.goto(portalUrl('parent'))
  await expect(page.getByText('Pembayaran', { exact: true }).first()).toBeVisible()
})

test('scanner browser UI remains live-camera only on desktop and mobile', async ({ page }) => {
  await page.goto(portalUrl('teacher', 'attendance'))

  await expect(page.getByRole('heading', { name: 'Scan Kehadiran' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Mulai Scan Live|Coba Lagi/ })).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)

  const mainText = await page.locator('#main-content').innerText()
  expect(mainText).not.toMatch(/unggah foto|upload foto|galeri|gallery|torch|flash|input manual|kode qr manual/i)
  await expectNoHorizontalOverflow(page)
})

test('key portal shells remain within viewport at current project size', async ({ page }) => {
  for (const role of ['admin', 'teacher', 'parent']) {
    await page.goto(portalUrl(role))
    await expect(page.locator('#main-content')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }
})

test('built PWA manifest and generated worker preserve controlled update contract', async ({ request, baseURL }) => {
  const manifestResponse = await request.get(new URL('site.webmanifest', baseURL).toString())
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json()
  expect(manifest.name).toBe('RA Nurul Falah')
  expect(manifest.id).toBe('./')
  expect(manifest.start_url).toBe('./')
  expect(manifest.scope).toBe('./')
  expect(manifest.display).toBe('standalone')

  const workerResponse = await request.get(new URL('sw.js', baseURL).toString())
  expect(workerResponse.ok()).toBe(true)
  const worker = await workerResponse.text()
  expect(worker).toContain('PRECACHE_URLS')
  expect(worker).toContain("event.data?.type === 'SKIP_WAITING'")
  expect(worker).toContain("request.mode === 'navigate'")

  const installStart = worker.indexOf("self.addEventListener('install'")
  const activateStart = worker.indexOf("self.addEventListener('activate'")
  expect(installStart).toBeGreaterThanOrEqual(0)
  expect(activateStart).toBeGreaterThan(installStart)
  expect(worker.slice(installStart, activateStart)).not.toContain('skipWaiting')
})
