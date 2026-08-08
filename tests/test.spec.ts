import { test, expect } from '@playwright/test';

test('authenticates the party host with mocked Spotify', async ({ page }) => {
  let profileRequestSeen = false;

  await page.route('https://api.spotify.com/v1/me', async (route) => {
    profileRequestSeen = true;
    expect(await route.request().headerValue('authorization')).toBe('Bearer party-fake-token');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-user-123',
        display_name: 'Mock Hitster DJ',
        email: 'mock-user@example.com',
        product: 'premium',
        country: 'IL',
      }),
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('party_spotify_token', 'party-fake-token');
  });

  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-roles')).toBeVisible();
  await page.getByRole('button', { name: /Create Room/ }).click();

  await expect(page.locator('#view-host-setup')).toBeVisible();
  await expect(page.locator('#host-email-display')).toHaveText('mock-user@example.com');
  expect(profileRequestSeen).toBe(true);
});