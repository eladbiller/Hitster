import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const authDirectory = 'playwright/.auth';
const authFile = `${authDirectory}/party.json`;
const partyUrl = process.env.PARTY_URL || 'https://ideal-goldfish-56gxrvv7p762qv5-4173.app.github.dev/party.html';

await mkdir(authDirectory, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ ...devices['iPhone 14'] });
const page = await context.newPage();

await page.goto(partyUrl);
console.log('Complete Spotify login in the remote browser.');

await page.waitForFunction(() => Boolean(localStorage.getItem('party_spotify_token')), null, { timeout: 0 });
await context.storageState({ path: authFile });
console.log(`Saved Playwright authentication state to ${authFile}.`);
await browser.close();