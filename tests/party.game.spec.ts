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

test('resumed host sends Spotify play requests', async ({ page }) => {
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
      gameState: 'READY_TO_PLAY',
      currentHostTrack: { u: 'spotify:track:resume', t: 'Resume Song', a: 'Artist', y: 2020, c: '' },
      tracks: [],
      currentMusicMode: 'hitster_classic',
    }));
  });

  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  const playRequests: string[] = [];
  await page.route('https://api.spotify.com/v1/me/player/play*', async (route) => {
    playRequests.push(route.request().url());
    await route.fulfill({ status: 204, body: '' });
  });

  await page.evaluate(() => {
    initSpotifyWebPlayer = () => {};
    eval('webDeviceId = "resume-device"');
    resumeHostGame();
    sendPlayerAction('TOGGLE_PLAY');
  });

  await expect.poll(() => playRequests.length).toBe(1);
  expect(playRequests[0]).toContain('device_id=resume-device');
  await expect(page.locator('#host-status-badge')).toHaveText('MUSIC PLAYING 🎵');
});

test('returns to the lobby when Spotify session expires', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('party_spotify_token', 'expired-token');
  });
  await page.route('https://api.spotify.com/v1/me', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  const profileRequest = page.waitForRequest('https://api.spotify.com/v1/me');
  await page.getByRole('button', { name: /Create Room/ }).click();
  await profileRequest;

  await expect(page.locator('#view-roles')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('party_spotify_token'))).toBeNull();
});

test('shows Spotify SDK playback errors to the host', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    const listeners = {};
    window.Spotify = {
      Player: class {
        addListener(name, handler) { listeners[name] = handler; }
        connect() { return true; }
      },
    };
    initSpotifyWebPlayer();
    listeners.account_error({ message: 'Premium account required' });
    listeners.initialization_error({ message: 'Browser playback unavailable' });
    listeners.playback_error({ message: 'Track unavailable' });
    listeners.autoplay_failed();
  });

  await expect(page.locator('#toast-container')).toContainText('Premium account required');
  await expect(page.locator('#toast-container')).toContainText('Browser playback unavailable');
  await expect(page.locator('#toast-container')).toContainText('Track unavailable');
  await expect(page.locator('#toast-container')).toContainText('Tap Play Song');
});

test('releases the player form when a duplicate name is rejected', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-roles')).toBeVisible();

  await page.evaluate(() => {
    class FakeConnection {
      open = false;
      handlers = {};
      on(name, handler) { this.handlers[name] = handler; }
      send() {}
      close() {}
    }

    window.Peer = class {
      handlers = {};
      constructor() { window.__fakePeer = this; }
      on(name, handler) { this.handlers[name] = handler; }
      connect() {
        const connection = new FakeConnection();
        window.__fakeConnection = connection;
        return connection;
      }
      destroy() {}
    };

    showPlayerJoin();
    document.getElementById('join-pin').value = '1234';
    document.getElementById('join-name').value = 'Alice';
    joinRoom();
  });

  await expect.poll(() => page.evaluate(() => Boolean(window.__fakePeer))).toBe(true);
  await page.evaluate(() => window.__fakePeer.handlers.open('fake-peer-id'));
  await expect.poll(() => page.evaluate(() => Boolean(window.__fakeConnection?.handlers.open && window.__fakeConnection?.handlers.data))).toBe(true);
  await page.evaluate(() => {
    const connection = window.__fakeConnection;
    connection.open = true;
    connection.handlers.open();
    connection.handlers.data({ type: 'JOIN_REJECTED', message: 'That name is already in use.' });
  });

  await expect(page.locator('#btn-connect')).toBeVisible();
  await expect(page.locator('#player-status')).toBeHidden();
  await expect(page.locator('#toast-container')).toContainText('That name is already in use.');
});

test('shows the paused state when a player loses the host connection', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    myPlayerName = 'Alice';
    handlePlayerSync({
      state: 'PAUSED_DISCONNECT',
      pausedPlayerName: 'Alice',
      myTokens: 2,
      myCardsCount: 1,
    });
  });

  await expect(page.locator('#p-ui-title')).toContainText('Game Paused');
  await expect(page.locator('#p-ui-desc')).toContainText('Waiting for Alice');
  await expect(page.locator('#p-music-controls')).toBeHidden();
});

test('prevents starting a game when the host room has no players', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => hostStartGameFromLobby());

  await expect(page.locator('#toast-container')).toContainText('No players in room!');
});

test('selects a random starting player from all online players', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const selectedIndex = await page.evaluate(() => {
    players = {
      host: { id: 'host', name: 'Host', online: true, tokens: 2, score: 0, timeline: [] },
      alice: { id: 'alice', name: 'Alice', online: true, tokens: 2, score: 0, timeline: [] },
      bob: { id: 'bob', name: 'Bob', online: true, tokens: 2, score: 0, timeline: [] },
    };
    turnOrder = ['host', 'alice', 'bob'];
    tracks = [
      { u: 'spotify:track:1', t: 'One', a: 'Artist', y: 2000, c: '' },
      { u: 'spotify:track:2', t: 'Two', a: 'Artist', y: 2001, c: '' },
      { u: 'spotify:track:3', t: 'Three', a: 'Artist', y: 2002, c: '' },
    ];
    Math.random = () => 0.99;
    hostStartGameFromLobby();
    return turnIndex;
  });

  expect(selectedIndex).toBe(2);
});

test('rotates through multiple online players and skips offline players', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const turnNames = await page.evaluate(() => {
    players = {
      host: { id: 'host', name: 'Host', online: true, tokens: 2, score: 0, timeline: [] },
      alice: { id: 'alice', name: 'Alice', online: true, tokens: 2, score: 0, timeline: [] },
      bob: { id: 'bob', name: 'Bob', online: false, tokens: 2, score: 0, timeline: [] },
    };
    turnOrder = ['host', 'alice', 'bob'];
    turnIndex = 0;
    tracks = [
      { u: 'spotify:track:1', t: 'One', a: 'Artist', y: 2000, c: '' },
      { u: 'spotify:track:2', t: 'Two', a: 'Artist', y: 2001, c: '' },
      { u: 'spotify:track:3', t: 'Three', a: 'Artist', y: 2002, c: '' },
    ];
    loadTurn();
    const names = [players[turnOrder[turnIndex]].name];
    nextTurn();
    names.push(players[turnOrder[turnIndex]].name);
    nextTurn();
    names.push(players[turnOrder[turnIndex]].name);
    return names;
  });

  expect(turnNames).toEqual(['Host', 'Alice', 'Host']);
});

test('explains fullscreen limitations instead of silently failing', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    for (const method of ['requestFullscreen', 'mozRequestFullScreen', 'webkitRequestFullScreen', 'msRequestFullscreen']) {
      Object.defineProperty(document.documentElement, method, { value: undefined, configurable: true });
    }
    toggleFullScreen();
  });

  await expect(page.locator('#toast-container')).toContainText('does not support fullscreen');
});

test('places active player counters before the player name', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    myPlayerName = 'Alice';
    handlePlayerSync({
      state: 'READY_TO_PLAY',
      isActivePlayer: false,
      activePlayerName: 'Bob',
      activePlayerCardsCount: 3,
      activePlayerTokens: 1,
      timeline: [],
      ownTimeline: [],
      myTokens: 2,
      myCardsCount: 1,
    });
  });

  const title = page.locator('#p-ui-title');
  await expect(title).toContainText('Bob');
  await expect(title.locator('div').first()).toContainText('3');
  const order = await title.evaluate((element) => {
    const children = Array.from(element.children);
    return children.findIndex(child => child.textContent?.includes('Bob')) > children.findIndex(child => child.textContent?.includes('3'));
  });
  expect(order).toBe(true);
});