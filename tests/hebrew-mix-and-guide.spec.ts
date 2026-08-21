import { test, expect } from '@playwright/test';

const ROOT = '';

for (const game of ['party.html', 'Jam.html']) {
  test(`${game} preserves Hebrew tracks and deliberately includes them in automatic mixes`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      const firstKey = getTrackIdentityKey('שיר אחד', 'עפרה חזה');
      const secondKey = getTrackIdentityKey('שיר אחר', 'עידן רייכל');
      const searchQuery = buildHebrewSearchQuery('2000-2009');
      const searchCalls: string[] = [];
      const originalSpotifyFetch = safeSpotifyFetch;
      eval('accessToken = "test-token"');
      currentMusicMode = 'hitster_classic';
      safeSpotifyFetch = async (url: string) => {
        searchCalls.push(url);
        return { tracks: { items: [] } };
      };
      return fetchTracksFromSpotify().then(() => {
        safeSpotifyFetch = originalSpotifyFetch;
        return {
          firstKey,
          secondKey,
          searchQuery,
          automaticSearchCalls: searchCalls.filter(url => url.includes('/v1/search')),
          artistsInEveryClassicEra: ['1960-1979', '1980-1989', '1990-1999', '2000-2009', '2010-2024']
            .every(era => HEBREW_ARTISTS_BY_ERA[era]?.length >= 1),
        };
      });
    });

    expect(result.firstKey).not.toBe('|');
    expect(result.secondKey).not.toBe('|');
    expect(result.secondKey).not.toBe(result.firstKey);
    expect(result.searchQuery).toMatch(/artist:"[\u0590-\u05FF]+/);
    expect(result.searchQuery).toContain('year:2000-2009');
    expect(result.artistsInEveryClassicEra).toBe(true);
    expect(result.automaticSearchCalls).toHaveLength(10);
    expect(result.automaticSearchCalls.filter(url => url.includes('market=IL'))).toHaveLength(5);
  });

  test(`${game} links to the Spotify developer setup guide from the main screen`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('a[href="spotify-dev-setup.html"]')).toHaveText('Spotify developer setup');
  });
}

test('Spotify developer setup guide explains allow-listing and safe PKCE setup', async ({ page }) => {
  await page.goto(`${ROOT}/spotify-dev-setup.html`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Spotify developer setup/i);
  await expect(page.getByText('Users Management', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Client Secret', { exact: false }).first()).toContainText('never put');
  await expect(page.getByText('https://YOUR-NAME.github.io/YOUR-REPOSITORY/party.html')).toBeVisible();
  await expect(page.getByText('https://YOUR-NAME.github.io/YOUR-REPOSITORY/Jam.html')).toBeVisible();
});
