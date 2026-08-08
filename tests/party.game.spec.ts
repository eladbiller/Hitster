import { test, expect } from '@playwright/test';

test('shows the host disconnect controls and pauses the room', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    triggerDisconnectPrompt('player-1', 'Alice');
  });

  await expect(page.locator('#host-disconnect-modal')).toBeVisible();
  await expect(page.locator('#disconnect-player-name')).toHaveText('Alice');
  await page.getByRole('button', { name: /Pause Room & Wait/ }).click();

  await expect(page.locator('#host-disconnect-modal')).toBeHidden();
  const gameState = await page.evaluate(() => eval('gameState'));
  expect(gameState).toBe('PAUSED_DISCONNECT');
});

test('restores a player quick-rejoin form after disconnect', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('party_last_pin', '1234');
    localStorage.setItem('party_player_name', 'Alice');
  });

  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const rejoinButton = page.getByRole('button', { name: /Rejoin Room/ });
  await expect(rejoinButton).toBeVisible();
  await rejoinButton.click();

  await expect(page.locator('#view-player-join')).toBeVisible();
  await expect(page.locator('#join-pin')).toHaveValue('1234');
  await expect(page.locator('#join-name')).toHaveValue('Alice');
  await expect(page.locator('#player-status')).toBeVisible();
});

test('shows the player connection-lost recovery overlay', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    document.getElementById('client-disconnect-overlay')?.classList.remove('hidden');
    document.getElementById('client-disconnect-overlay')?.classList.add('flex');
  });

  await expect(page.locator('#client-disconnect-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connection Lost' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Reload & Rejoin/ })).toBeVisible();
});

test('requires Spotify before a player can create a host room', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Create Room/ }).click();

  await expect(page.locator('#view-spotify-login')).toBeVisible();
  await expect(page.getByRole('button', { name: /Login with Spotify/ })).toBeVisible();
});

test('validates the player PIN and name before connecting', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Join Room/ }).click();

  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('#toast-container')).toContainText('Enter a 4-digit PIN.');

  await page.locator('#join-pin').fill('1234');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('#toast-container')).toContainText('Enter your name.');
});

test('kicks a disconnected player and returns the room to active play', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    eval(`players['alice'] = { id: 'alice', name: 'Alice', conn: null, online: false, tokens: 2, score: 0, timeline: [] };`);
    eval(`turnOrder = ['host-local-player', 'alice'];`);
    eval(`players['host-local-player'] = { id: 'host-local-player', name: 'Host DJ', conn: null, online: true, tokens: 2, score: 0, timeline: [] };`);
    triggerDisconnectPrompt('alice', 'Alice');
  });

  await page.getByRole('button', { name: /Kick Player & Continue/ }).click();
  await expect(page.locator('#host-disconnect-modal')).toBeHidden();
  await expect(page.locator('#toast-container')).not.toContainText('Alice');

  const remainingPlayers = await page.evaluate(() => eval(`Object.keys(players)`));
  expect(remainingPlayers).not.toContain('alice');
});

test('resumes a paused host game in a playable state', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('party_spotify_token', 'resume-test-token');
    localStorage.setItem('party_host_state', JSON.stringify({
      pin: 1234,
      players: {
        'host-local-player': {
          id: 'host-local-player', name: 'Host DJ', online: false, conn: null,
          tokens: 2, score: 0, timeline: [],
        },
      },
      turnOrder: ['host-local-player'],
      turnIndex: 0,
      gameState: 'PAUSED_DISCONNECT',
      previousStateBeforePause: 'READY_TO_PLAY',
      currentHostTrack: { u: 'spotify:track:resume', t: 'Resume Song', a: 'Artist', y: 2020, c: '' },
      tracks: [],
      currentMusicMode: 'hitster_classic',
    }));
  });

  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    initSpotifyWebPlayer = () => {};
    resumeHostGame();
  });

  const gameState = await page.evaluate(() => eval('gameState'));
  expect(gameState).toBe('READY_TO_PLAY');
  await expect(page.locator('#host-game-ui')).toBeVisible();
});