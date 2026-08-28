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

test('lets a host save a personal Spotify Client ID without changing the game code', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Create Room/ }).click();
  await page.getByRole('button', { name: /Use your own Spotify Client ID/ }).click();
  await page.locator('#custom-spotify-client-id').fill('1234567890abcdef1234567890abcdef');
  await page.getByRole('button', { name: /Use this Client ID/ }).click();

  const result = await page.evaluate(() => ({
    clientId: eval('spotifyClientId'),
    savedClientId: localStorage.getItem('party_custom_spotify_client_id'),
    accessToken: eval('accessToken'),
  }));
  expect(result).toEqual({
    clientId: '1234567890abcdef1234567890abcdef',
    savedClientId: '1234567890abcdef1234567890abcdef',
    accessToken: null,
  });
});

test('silently refreshes an expired Spotify token without resetting the room', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const originalFetch = window.fetch;
    let apiCalls = 0;
    eval('accessToken = "expired-token"');
    localStorage.setItem('party_spotify_refresh_token', 'refresh-token');
    window.fetch = async (url) => {
      if (String(url).includes('accounts.spotify.com/api/token')) {
        return new Response(JSON.stringify({ access_token: 'fresh-token', refresh_token: 'next-refresh-token' }), { status: 200 });
      }
      apiCalls++;
      if (apiCalls === 1) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ email: 'host@example.com' }), { status: 200 });
    };
    try {
      const profile = await safeSpotifyFetch('https://api.spotify.com/v1/me');
      return {
        profileEmail: profile.email,
        apiCalls,
        accessToken: eval('accessToken'),
        refreshToken: localStorage.getItem('party_spotify_refresh_token'),
      };
    } finally {
      window.fetch = originalFetch;
    }
  });

  expect(result).toEqual({
    profileEmail: 'host@example.com',
    apiCalls: 2,
    accessToken: 'fresh-token',
    refreshToken: 'next-refresh-token',
  });
});

test('pauses and saves a host room when Spotify needs an interactive renewal', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    isHostMode = true;
    gameState = 'PLAYING';
    previousStateBeforePause = 'READY_TO_PLAY';
    currentRoomPin = 4321;
    players = { 'host-local-player': { id: 'host-local-player', name: 'Host', online: true, timeline: [], tokens: 2, score: 0 } };
    turnOrder = ['host-local-player'];
    pauseForSpotifyRenewal();
    const saved = JSON.parse(localStorage.getItem('party_host_state'));
    return {
      state: gameState,
      previousState: previousStateBeforePause,
      bannerVisible: !document.getElementById('host-spotify-renew-banner').classList.contains('hidden'),
      savedPin: saved.pin,
      savedState: saved.gameState,
      shouldResume: sessionStorage.getItem('party_resume_after_spotify_login'),
    };
  });

  expect(result).toEqual({
    state: 'PAUSED_SPOTIFY',
    previousState: 'PLAYING',
    bannerVisible: true,
    savedPin: 4321,
    savedState: 'PAUSED_SPOTIFY',
    shouldResume: 'true',
  });
});

test('tells players that the room will resume while the host renews Spotify', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    handlePlayerSync({ state: 'PAUSED_SPOTIFY', myTokens: 2, myCardsCount: 1, activePlayerName: 'Alice' });
    const waitsForRenewal = eval('waitingForSpotifyRenewal');
    handlePlayerSync({ state: 'READY_TO_PLAY', myTokens: 2, myCardsCount: 1, activePlayerName: 'Alice', isActivePlayer: false, isPlaying: false, timeline: [], ownTimeline: [] });
    return { waitsForRenewal, clearedAfterResume: !eval('waitingForSpotifyRenewal') };
  });

  expect(result).toEqual({ waitsForRenewal: true, clearedAfterResume: true });
  await expect(page.locator('#p-ui-title')).toContainText("Alice's Turn");
  await expect(page.locator('#p-music-controls')).toBeHidden();
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
    localStorage.clear();
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

test('lets a player leave fullscreen from the rotate-screen view', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => document.documentElement,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: () => { window.__exitFullscreenCalls = (window.__exitFullscreenCalls || 0) + 1; },
    });
    updateFullScreenIndicator();
    const visibleBeforeExit = !document.getElementById('portrait-exit-fullscreen').classList.contains('hidden');
    exitFullScreen();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { visibleBeforeExit, exitCalls: window.__exitFullscreenCalls || 0 };
  });

  expect(result).toEqual({ visibleBeforeExit: true, exitCalls: 1 });
});

test('avoids back-to-back artists and albums whenever another track is available', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    currentHostTrack = { u: 'spotify:track:previous', t: 'Previous', a: 'Same Artist', al: 'same-album', y: 2000, c: '' };
    tracks = [
      { u: 'spotify:track:safe', t: 'Safe', a: 'Different Artist', al: 'different-album', y: 2001, c: '' },
      { u: 'spotify:track:same-album', t: 'Same Album', a: 'Different Artist', al: 'same-album', y: 2002, c: '' },
      { u: 'spotify:track:same-artist', t: 'Same Artist', a: 'Same Artist', al: 'different-album', y: 2003, c: '' },
    ];
    return popTrack();
  });

  expect(result.u).toBe('spotify:track:safe');
});

test('keeps every artist to one song in the ready batch', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    tracks = [];
    const accepted = limitTracksPerArtist([
      { u: 'spotify:track:a1', t: 'A1', a: 'Popular Artist' },
      { u: 'spotify:track:a2', t: 'A2', a: 'Popular Artist' },
      { u: 'spotify:track:a3', t: 'A3', a: 'Popular Artist' },
      { u: 'spotify:track:b1', t: 'B1', a: 'Another Artist' },
    ]);
    return accepted.map(track => track.u);
  });

  expect(result).toEqual(['spotify:track:a1', 'spotify:track:b1']);
});

test('builds Classic fetches from distinct artists and honours the language limits', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    const summarize = (percentage) => {
      classicHebrewPercentage = percentage;
      const plan = getClassicArtistSearchPlan('hitster_classic');
      return {
        total: plan.length,
        hebrew: plan.filter(item => item.language === 'hebrew').length,
        english: plan.filter(item => item.language === 'english').length,
        uniqueArtists: new Set(plan.map(item => `${item.language}:${item.artist.toLocaleLowerCase()}`)).size,
        eras: new Set(plan.map(item => item.era)).size,
      };
    };
    return { balanced: summarize(50), mostlyEnglish: summarize(5), mostlyHebrew: summarize(95) };
  });

  expect(result.balanced).toEqual({ total: 30, hebrew: 15, english: 15, uniqueArtists: 30, eras: 5 });
  expect(result.mostlyEnglish).toEqual({ total: 30, hebrew: 2, english: 28, uniqueArtists: 30, eras: 5 });
  expect(result.mostlyHebrew).toEqual({ total: 30, hebrew: 28, english: 2, uniqueArtists: 30, eras: 5 });
});

test('offers a broad Spotify Popular Mix without artist search filters', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => switchSetupView('view-host-setup'));
  await expect(page.getByRole('button', { name: /Spotify Popular Mix/ })).toBeVisible();

  const result = await page.evaluate(async () => {
    const originalSpotifyFetch = safeSpotifyFetch;
    const searchCalls = [];
    eval('accessToken = "test-token"');
    currentMusicMode = 'hitster_popular_decades';
    tracks = [];
    players = {};
    currentHostTrack = null;
    let requestId = 0;
    safeSpotifyFetch = async (url) => {
      searchCalls.push(url);
      const currentRequest = requestId++;
      return {
        tracks: {
          items: Array.from({ length: 10 }, (_, index) => ({
            uri: `spotify:track:popular-${currentRequest}-${index}`,
            name: `Popular song ${currentRequest}-${index}`,
            artists: [{ name: `Popular artist ${currentRequest}-${index}` }],
            album: { id: `popular-album-${currentRequest}-${index}`, release_date: '2005-01-01', images: [] },
            popularity: 100 - index,
            is_local: false,
          })),
        },
      };
    };
    await fetchTracksFromSpotify();
    safeSpotifyFetch = originalSpotifyFetch;
    return {
      searchCalls,
      trackCount: tracks.length,
      artists: new Set(tracks.map(track => track.a)).size,
      albums: new Set(tracks.map(track => track.al)).size,
    };
  });

  expect(result.searchCalls).toHaveLength(5);
  expect(result.searchCalls.every(url => decodeURIComponent(url).includes('year:') && !decodeURIComponent(url).includes('artist:') && url.includes('limit=10') && !url.includes('market=IL'))).toBe(true);
  expect(result).toMatchObject({ trackCount: 50, artists: 50, albums: 50 });
});

test('keeps Spotify Popular Mix playable when one decade search fails', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const originalSpotifyFetch = safeSpotifyFetch;
    eval('accessToken = "test-token"');
    currentMusicMode = 'hitster_popular_decades';
    tracks = [];
    players = {};
    currentHostTrack = null;
    let requestId = 0;
    safeSpotifyFetch = async () => {
      const currentRequest = requestId++;
      if (currentRequest === 0) throw new Error('Spotify Error 429');
      return {
        tracks: {
          items: Array.from({ length: 10 }, (_, index) => ({
            uri: `spotify:track:resilient-${currentRequest}-${index}`,
            name: `Resilient song ${currentRequest}-${index}`,
            artists: [{ name: `Resilient artist ${currentRequest}-${index}` }],
            album: { id: `resilient-album-${currentRequest}-${index}`, release_date: '2005-01-01', images: [] },
            popularity: 100 - index,
            is_local: false,
          })),
        },
      };
    };
    await fetchTracksFromSpotify();
    safeSpotifyFetch = originalSpotifyFetch;
    return { trackCount: tracks.length, errors: document.getElementById('toast-container').innerText };
  });

  expect(result.trackCount).toBe(40);
  expect(result.errors).not.toContain('Failed to load tracks');
});

test('keeps albums unique in the ready batch and avoids recently played artists and albums', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    tracks = [];
    const accepted = limitTracksPerArtist([
      { u: 'spotify:track:a1', t: 'A1', a: 'Artist A', al: 'album-one' },
      { u: 'spotify:track:b1', t: 'B1', a: 'Artist B', al: 'album-one' },
      { u: 'spotify:track:c1', t: 'C1', a: 'Artist C', al: 'album-two' },
    ]);
    recentTrackHistory = [{ artist: 'recent artist', album: 'recent-album', uri: 'spotify:track:recent' }];
    tracks = [
      { u: 'spotify:track:recent-artist', t: 'Recent Artist', a: 'Recent Artist', al: 'different-album' },
      { u: 'spotify:track:recent-album', t: 'Recent Album', a: 'Different Artist', al: 'recent-album' },
      { u: 'spotify:track:safe', t: 'Safe', a: 'Fresh Artist', al: 'fresh-album' },
    ];
    const next = popTrack();
    return { accepted: accepted.map(track => track.u), next: next.u };
  });

  expect(result).toEqual({
    accepted: ['spotify:track:a1', 'spotify:track:c1'],
    next: 'spotify:track:safe',
  });
});

test('places active player counters after the player name', async ({ page }) => {
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
    return children.findIndex(child => child.textContent?.includes('Bob')) < children.findIndex(child => child.textContent?.includes('3'));
  });
  expect(order).toBe(true);
});

test('persists a stable reconnect token for fast mobile reloads', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const tokens = await page.evaluate(() => {
    localStorage.removeItem('party_player_reconnect_token');
    const first = getPlayerReconnectToken();
    const second = getPlayerReconnectToken();
    return { first, second, saved: localStorage.getItem('party_player_reconnect_token') };
  });

  expect(tokens.first).toBeTruthy();
  expect(tokens.second).toBe(tokens.first);
  expect(tokens.saved).toBe(tokens.first);
});

test('keeps a seven-player room stable through a stale-socket reconnect', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const room = await page.evaluate(() => {
    class FakeConnection {
      metadata;
      open = false;
      handlers = {};
      constructor(metadata) { this.metadata = metadata; }
      on(name, handler) { this.handlers[name] = handler; }
      send() {}
      close() { this.open = false; this.handlers.close?.(); }
    }

    window.Peer = class {
      handlers = {};
      constructor() { window.__stressPeer = this; }
      on(name, handler) { this.handlers[name] = handler; }
      destroy() {}
    };

    players = {};
    turnOrder = [];
    turnIndex = 0;
    gameState = 'READY_TO_PLAY';
    isHostMode = true;
    initHostNetwork(false);
    window.__stressPeer.handlers.open();

    const connections = [];
    for (let index = 1; index <= 7; index++) {
      const metadata = { playerName: `Player ${index}`, reconnectToken: `token-${index}` };
      const connection = new FakeConnection(metadata);
      connections.push(connection);
      window.__stressPeer.handlers.connection(connection);
      connection.open = true;
      connection.handlers.open();
    }

    const dropped = connections[3];
    dropped.close();
    const reconnect = new FakeConnection({ playerName: 'Player 4', reconnectToken: 'token-4' });
    window.__stressPeer.handlers.connection(reconnect);
    reconnect.open = true;
    reconnect.handlers.open();

    clearInterval(hostBroadcastInterval);
    return {
      playerCount: Object.keys(players).length,
      onlineCount: Object.values(players).filter(player => player.online).length,
      turnCount: turnOrder.length,
      state: gameState,
      reconnectAccepted: players['player 4']?.conn === reconnect,
    };
  });

  expect(room).toEqual({ playerCount: 7, onlineCount: 7, turnCount: 7, state: 'READY_TO_PLAY', reconnectAccepted: true });
});

test('ignores stale client socket events after a browser reconnect', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const state = await page.evaluate(() => {
    class FakeConnection {
      open = false;
      handlers = {};
      on(name, handler) { this.handlers[name] = handler; }
      send() {}
      close() { this.open = false; this.handlers.close?.(); }
    }

    class FakePeer {
      handlers = {};
      connections = [];
      on(name, handler) { this.handlers[name] = handler; }
      connect() {
        const connection = new FakeConnection();
        this.connections.push(connection);
        return connection;
      }
      destroy() {}
    }

    const realSetTimeout = window.setTimeout;
    const delayedCallbacks = [];
    window.setTimeout = ((callback, delay) => {
      if (delay < 1000) {
        callback();
        return 1;
      }
      if (delay === 15000) return 2;
      delayedCallbacks.push(callback);
      return delayedCallbacks.length + 2;
    }) as typeof window.setTimeout;

    const peers = [];
    window.Peer = class extends FakePeer {
      constructor() {
        super();
        peers.push(this);
      }
    };

    showPlayerJoin();
    document.getElementById('join-pin').value = '1234';
    document.getElementById('join-name').value = 'Alice';

    const openNewestConnection = () => {
      const peer = peers[peers.length - 1];
      peer.handlers.open(`peer-${peers.length}`);
      const connection = peer.connections[0];
      connection.open = true;
      connection.handlers.open();
      return { peer, connection };
    };

    joinRoom();
    const first = openNewestConnection();

    // This simulates the player reopening the game while PeerJS finishes
    // delivering close/error events from the previous browser session.
    joinRoom(true);
    const second = openNewestConnection();
    first.connection.handlers.close();
    first.peer.handlers.error({ type: 'network' });

    const result = {
      activePeerIsNewest: myPeer === second.peer,
      activeConnectionIsNewest: hostConnection === second.connection,
      reconnectWasScheduled: reconnectTimer !== null,
      connectionLostVisible: !document.getElementById('client-disconnect-overlay').classList.contains('hidden'),
    };

    if (clientWatchdog) clearInterval(clientWatchdog);
    window.setTimeout = realSetTimeout;
    return result;
  });

  expect(state).toEqual({
    activePeerIsNewest: true,
    activeConnectionIsNewest: true,
    reconnectWasScheduled: false,
    connectionLostVisible: false,
  });
});

test('pauses a stale player before an expired steal window can score', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const state = await page.evaluate(() => {
    class FakeConnection {
      open = true;
      handlers = {};
      on(name, handler) { this.handlers[name] = handler; }
      send() {}
    }

    class FakePeer {
      handlers = {};
      on(name, handler) { this.handlers[name] = handler; }
    }

    const realSetInterval = window.setInterval;
    let hostTick;
    window.setInterval = ((callback) => {
      hostTick = callback;
      return 1;
    }) as typeof window.setInterval;

    window.Peer = class extends FakePeer {
      constructor() { super(); window.__stealPeer = this; }
    };

    players = {
      'host-local-player': { id: 'host-local-player', name: 'Host DJ', conn: null, online: true, tokens: 2, score: 0, timeline: [], lastPongAt: Date.now() },
      alice: { id: 'alice', name: 'Alice', conn: new FakeConnection(), online: true, tokens: 2, score: 0, timeline: [], lastPongAt: Date.now() - 6000 },
    };
    turnOrder = ['host-local-player', 'alice'];
    turnIndex = 0;
    gameState = 'STEALING';
    stealEndTime = Date.now() - 1;
    isHostMode = true;
    initHostNetwork(false);
    window.__stealPeer.handlers.open();
    hostTick();

    const result = {
      gameState,
      aliceOnline: players.alice.online,
      disconnectVisible: !document.getElementById('host-disconnect-modal').classList.contains('hidden'),
    };

    window.setInterval = realSetInterval;
    clearInterval(hostBroadcastInterval);
    return result;
  });

  expect(state).toEqual({
    gameState: 'PAUSED_DISCONNECT',
    aliceOnline: false,
    disconnectVisible: true,
  });
});

test('restarts the steal timer when the paused player reconnects', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const state = await page.evaluate(() => {
    class FakeConnection {
      open = false;
      handlers = {};
      metadata = { playerName: 'Alice', reconnectToken: 'alice-token' };
      on(name, handler) { this.handlers[name] = handler; }
      send() {}
      close() { this.open = false; }
    }

    class FakePeer {
      handlers = {};
      on(name, handler) { this.handlers[name] = handler; }
    }

    window.Peer = class extends FakePeer {
      constructor() { super(); window.__rejoinPeer = this; }
    };

    const previousDeadline = Date.now() - 1000;
    players = {
      'host-local-player': { id: 'host-local-player', name: 'Host DJ', conn: null, online: true, tokens: 2, score: 0, timeline: [], lastPongAt: Date.now() },
      alice: { id: 'alice', name: 'Alice', conn: null, online: false, reconnectToken: 'alice-token', tokens: 2, score: 0, timeline: [], lastPongAt: Date.now() - 6000 },
    };
    turnOrder = ['host-local-player', 'alice'];
    turnIndex = 0;
    gameState = 'PAUSED_DISCONNECT';
    previousStateBeforePause = 'STEALING';
    pendingDisconnectPlayerId = 'alice';
    stealEndTime = previousDeadline;
    isHostMode = true;

    initHostNetwork(false);
    window.__rejoinPeer.handlers.open();
    const reconnect = new FakeConnection();
    window.__rejoinPeer.handlers.connection(reconnect);
    reconnect.open = true;
    reconnect.handlers.open();

    const result = {
      state: gameState,
      aliceOnline: players.alice.online,
      secondsRestored: Math.ceil((stealEndTime - Date.now()) / 1000),
      pendingDisconnectPlayerId,
    };

    clearInterval(hostBroadcastInterval);
    return result;
  });

  expect(state.state).toBe('STEALING');
  expect(state.aliceOnline).toBe(true);
  expect(state.secondsRestored).toBeGreaterThanOrEqual(14);
  expect(state.pendingDisconnectPlayerId).toBeNull();
});

test('filters single, live, remix, and acoustic track variants', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const results = await page.evaluate(() => [
    isPreferredTrack('Bohemian Rhapsody - Single Version'),
    isPreferredTrack('We Will Rock You (Live)'),
    isPreferredTrack('Radio Ga Ga - Radio Edit'),
    isPreferredTrack('Another One Bites the Dust'),
    isPreferredTrack('Love of My Life (Acoustic)'),
  ]);

  expect(results).toEqual([false, false, false, true, false]);
});

test('automatically retries a dropped player connection', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const retry = await page.evaluate(() => {
    let scheduled = 0;
    window.setTimeout = (() => {
      scheduled++;
      return scheduled;
    });
    localStorage.setItem('party_last_pin', '1234');
    localStorage.setItem('party_player_name', 'Alice');
    reconnectEnabled = true;
    reconnectAttempts = 0;
    reconnectTimer = null;
    schedulePlayerReconnect();
    return { attempts: reconnectAttempts, timer: reconnectTimer !== null, scheduled };
  });

  expect(retry.attempts).toBe(1);
  expect(retry.scheduled).toBe(1);
});

test('retries after PeerJS connection timeout or signaling error', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  const retry = await page.evaluate(() => {
    let scheduled = 0;
    window.setTimeout = (() => {
      scheduled++;
      return scheduled;
    });
    localStorage.setItem('party_last_pin', '1234');
    localStorage.setItem('party_player_name', 'Alice');
    reconnectEnabled = true;
    reconnectAttempts = 0;
    reconnectTimer = null;
    schedulePlayerReconnect();
    return { attempts: reconnectAttempts, scheduled };
  });

  expect(retry).toEqual({ attempts: 1, scheduled: 1 });
});

test('does not offer players a force-reveal control while waiting for steals', async ({ page }) => {
  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    myPlayerName = 'Alice';
    handlePlayerSync({
      state: 'STEALING',
      isActivePlayer: true,
      allStealsDone: false,
      waitingOn: ['Bob', 'Carol'],
      stealTimeLeft: 10,
      myTokens: 2,
      myCardsCount: 1,
      timeline: [],
      ownTimeline: [],
      guesses: {},
    });
  });

  await expect(page.getByText(/Force Reveal|Skip Bob|Skip Carol/)).toHaveCount(0);
});
