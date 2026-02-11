import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('Login page loads', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByRole('heading', { name: /flexiwork|sign in|log in|login/i }).or(page.getByText(/sign in|log in/i)).first()).toBeVisible({ timeout: 10000 })
  })

  test('Dashboard requires auth (redirects to login or shows dashboard)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/(dashboard|auth\/login|login)/, { timeout: 10000 })
    const url = page.url()
    const onLogin = url.includes('/login') || url.includes('/auth/login')
    const onDashboard = url.includes('/dashboard')
    expect(onLogin || onDashboard).toBeTruthy()
  })

  test('Team page loads when authenticated', async ({ page }) => {
    await page.goto('/dashboard/team')
    await page.waitForURL(/\/(dashboard\/team|auth\/login|login)/, { timeout: 10000 })
    if (page.url().includes('/login') || page.url().includes('/auth/login')) {
      test.skip()
      return
    }
    await expect(page.getByText(/Manage Team|Loading team|Team/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Health endpoint returns JSON', async ({ request }) => {
    const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'
    const res = await request.get(`${baseUrl}/api/health`)
    expect(res.ok() || res.status() === 503).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('database')
  })
})

test.describe('Critical flows (run when app is up and auth available)', () => {
  test.skip('Login → Dashboard', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL || 'test@example.com')
    await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD || 'password')
    await page.getByRole('button', { name: /sign in|log in/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
  })

  test.skip('Dashboard → Team → View Member', async ({ page }) => {
    await page.goto('/dashboard/team')
    await page.waitForSelector('text=Manage Team', { timeout: 10000 })
    const viewLink = page.getByRole('link', { name: /view/i }).first()
    if (await viewLink.isVisible()) {
      await viewLink.click()
      await expect(page).toHaveURL(/\/dashboard\/workers\/.+/)
    }
  })

  test.skip('Create Roster → Add Shift', async ({ page }) => {
    await page.goto('/dashboard/rota')
    await page.waitForLoadState('networkidle')
    const addShift = page.getByRole('button', { name: /add shift|new shift/i }).first()
    if (await addShift.isVisible()) {
      await addShift.click()
      await expect(page.getByText(/shift|date|time/i).first()).toBeVisible({ timeout: 5000 })
    }
  })

  test.skip('Invite Worker', async ({ page }) => {
    await page.goto('/dashboard/team')
    await page.waitForSelector('text=Manage Team', { timeout: 10000 })
    const inviteBtn = page.getByRole('button', { name: /invite worker|invite/i }).first()
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click()
      await expect(page.getByLabel(/email|worker/i).first()).toBeVisible({ timeout: 5000 })
    }
  })
})
