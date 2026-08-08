import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const spotifyAccessToken = process.env.SPOTIFY_ACCESS_TOKEN;
const authStateFile = 'playwright/.auth/party.json';
const partyUrl = process.env.PARTY_URL || undefined;

test.use({ storageState: existsSync(authStateFile) ? authStateFile : undefined });

test('connects party.html to the real Spotify profile API', async ({ page }) => {
  test.skip(!spotifyAccessToken && !existsSync(authStateFile), 'Complete mobile Playwright login or set SPOTIFY_ACCESS_TOKEN.');

  if (spotifyAccessToken) {
    await page.addInitScript((token) => {
      localStorage.setItem('party_spotify_token', token);
    }, spotifyAccessToken);
  }

  await page.goto(partyUrl || '/party.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-roles')).toBeVisible();
  await page.getByRole('button', { name: /Create Room/ }).click();

  await expect(page.locator('#view-host-setup')).toBeVisible();
  await expect(page.locator('#host-email-display')).not.toHaveText('Ready');
});