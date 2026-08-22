import { test, expect } from '@playwright/test';

const ROOT = '';

for (const game of ['party.html', 'Jam.html']) {
  test(`${game} preserves Hebrew tracks and plans balanced, Hebrew-only, and English-only classic mixes`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      const firstKey = getTrackIdentityKey('שיר אחד', 'עפרה חזה');
      const secondKey = getTrackIdentityKey('שיר אחר', 'עידן רייכל');
      const hebrewQueries = buildLanguageSearchQueries('2000-2009', 'hebrew', 2);
      const englishQueries = buildLanguageSearchQueries('2000-2009', 'english', 2);
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
          hebrewQueries,
          englishQueries,
          automaticSearchCalls: searchCalls.filter(url => url.includes('/v1/search')),
          classicPlan: getClassicLanguagePlan('hitster_classic'),
          hebrewOnlyPlan: getClassicLanguagePlan('hitster_hebrew_classic'),
          englishOnlyPlan: getClassicLanguagePlan('hitster_english_classic'),
          artistsInEveryClassicEra: ['1960-1979', '1980-1989', '1990-1999', '2000-2009', '2010-2024']
            .every(era => HEBREW_ARTISTS_BY_ERA[era]?.length >= 1),
        };
      });
    });

    expect(result.firstKey).not.toBe('|');
    expect(result.secondKey).not.toBe('|');
    expect(result.secondKey).not.toBe(result.firstKey);
    expect(result.hebrewQueries).toHaveLength(2);
    expect(result.englishQueries).toHaveLength(2);
    expect(result.hebrewQueries.every(query => /artist:"[\u0590-\u05FF]+/.test(query) && query.includes('year:2000-2009'))).toBe(true);
    expect(result.englishQueries.every(query => /artist:"[A-Za-z]/.test(query) && query.includes('year:2000-2009'))).toBe(true);
    expect(result.artistsInEveryClassicEra).toBe(true);
    const expectedAutomaticSearches = game === 'party.html' ? 20 : 10;
    expect(result.automaticSearchCalls).toHaveLength(expectedAutomaticSearches);
    expect(result.automaticSearchCalls.filter(url => url.includes('market=IL'))).toHaveLength(expectedAutomaticSearches);
    expect(result.classicPlan).toEqual(game === 'party.html'
      ? ['hebrew', 'hebrew', 'english', 'english']
      : ['hebrew', 'english']);
    expect(result.hebrewOnlyPlan).toEqual(['hebrew', 'hebrew']);
    expect(result.englishOnlyPlan).toEqual(['english', 'english']);
  });

  test(`${game} links to the Spotify developer setup guide from the main screen`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('a[href="spotify-dev-setup.html"]')).toHaveText('Spotify developer setup');
  });

  test(`${game} offers separate Hebrew and English Classic Mix buttons`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => switchSetupView('view-host-setup'));
    await expect(page.getByRole('button', { name: /Hebrew Classic/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /English Classic/ })).toBeVisible();
    const classicButton = page.getByRole('button', { name: /The Classic Mix/ });
    await expect(classicButton).toContainText(game === 'party.html' ? 'Choose your Hebrew / English balance' : '50% Hebrew / 50% English');
  });

  test(`${game} balances the real Classic deck when Spotify returns fewer English results`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const originalSpotifyFetch = safeSpotifyFetch;
      eval('accessToken = "test-token"');
      currentMusicMode = 'hitster_classic';
      if (window.location.pathname.endsWith('party.html')) classicHebrewPercentage = 50;
      tracks = [];
      players = {};
      currentHostTrack = null;
      let serial = 0;
      safeSpotifyFetch = async (url: string) => {
        const isHebrew = /[\u0590-\u05FF]/.test(decodeURIComponent(url));
        const size = isHebrew ? 5 : 3;
        const requestId = serial++;
        return {
          tracks: {
            items: Array.from({ length: size }, (_, index) => ({
              uri: `spotify:track:${isHebrew ? 'h' : 'e'}-${requestId}-${index}`,
              name: `${isHebrew ? 'H' : 'E'} song ${requestId}-${index}`,
              artists: [{ name: isHebrew ? 'Hebrew Artist' : 'English Artist' }],
              album: { release_date: '2005-01-01', images: [] },
              is_local: false,
            })),
          },
        };
      };
      await fetchTracksFromSpotify();
      safeSpotifyFetch = originalSpotifyFetch;
      return {
        total: tracks.length,
        hebrew: tracks.filter(track => track.t.startsWith('H song')).length,
        english: tracks.filter(track => track.t.startsWith('E song')).length,
      };
    });

    expect(result).toEqual(game === 'party.html'
      ? { total: 60, hebrew: 30, english: 30 }
      : { total: 30, hebrew: 15, english: 15 });
  });
}

test('Party lets the host choose the Hebrew percentage before creating a Classic room', async ({ page }) => {
  await page.goto(`${ROOT}/party.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => switchSetupView('view-host-setup'));
  await page.getByRole('button', { name: /The Classic Mix/ }).click();

  await expect(page.getByRole('heading', { name: 'Classic Mix balance' })).toBeVisible();
  const slider = page.locator('#classic-hebrew-slider');
  await expect(slider).toHaveAttribute('min', '5');
  await expect(slider).toHaveAttribute('max', '95');
  await expect(slider).toHaveValue('50');
  await slider.evaluate((element: HTMLInputElement) => {
    element.value = '70';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#classic-hebrew-percent')).toHaveText('70%');
  await expect(page.locator('#classic-english-percent')).toHaveText('30%');
  await expect(page.locator('#classic-hebrew-fill')).toHaveAttribute('style', /width: 70%/);
  const seventyPercentResult = await page.evaluate(() => {
    const sample = language => Array.from({ length: language === 'hebrew' ? 5 : 3 }, (_, index) => ({ language, index }));
    const selected = selectClassicLanguageItems({ hebrew: sample('hebrew'), english: sample('english') });
    return {
      hebrew: selected.filter(item => item.language === 'hebrew').length,
      english: selected.filter(item => item.language === 'english').length,
    };
  });
  expect(seventyPercentResult).toEqual({ hebrew: 5, english: 2 });

  await page.getByRole('button', { name: /Back to music modes/ }).click();
  await page.getByRole('button', { name: /The Classic Mix/ }).click();
  await expect(slider).toHaveValue('50');
});

test('Spotify developer setup guide explains allow-listing and safe PKCE setup', async ({ page }) => {
  await page.goto(`${ROOT}/spotify-dev-setup.html`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Spotify developer setup/i);
  await expect(page.getByText('Users Management', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Client Secret', { exact: false }).first()).toContainText('never put');
  await expect(page.getByText('https://YOUR-NAME.github.io/YOUR-REPOSITORY/party.html')).toBeVisible();
  await expect(page.getByText('https://YOUR-NAME.github.io/YOUR-REPOSITORY/Jam.html')).toBeVisible();
});
