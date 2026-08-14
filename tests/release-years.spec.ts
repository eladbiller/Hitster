import { test, expect } from '@playwright/test';

const ROOT = '';

for (const game of ['party.html', 'Jam.html']) {
  test(`${game} uses the original release year instead of a later compilation year`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const years = await page.evaluate(async () => Promise.all([
      getOriginalReleaseYear({
        name: 'The House of the Rising Sun',
        artists: [{ name: 'Frijid Pink' }],
        album: { release_date: '1990-01-01' },
      }),
      getOriginalReleaseYear({
        name: 'The House of the Rising Sun',
        artists: [{ name: 'The Animals' }],
        album: { release_date: '1990-01-01' },
      }),
    ]));

    expect(years).toEqual([1970, 1964]);
  });
}
