import { test, expect } from '@playwright/test';

const HOST_PLAYER_ID = 'host-local-player';
const TRACK_URI = 'spotify:track:playback-test';

test('party.html sends the selected track to its browser playback device', async ({ page }) => {
  const playRequests: Array<{ url: string; body: string | null }> = [];

  await page.route('https://api.spotify.com/v1/me/player/play*', async (route) => {
    playRequests.push({ url: route.request().url(), body: route.request().postData() });
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/party.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    eval("players = { 'host-local-player': { id: 'host-local-player', name: 'Host DJ', conn: null, online: true, tokens: 2, score: 0, timeline: [] } }");
    eval("turnOrder = ['host-local-player']; turnIndex = 0; gameState = 'READY_TO_PLAY';");
    eval("currentHostTrack = { u: 'spotify:track:playback-test', t: 'Playback Test', a: 'Hitster', y: 2024, c: '' };");
    eval("webDeviceId = 'party-browser-device'; isPlaying = false;");
    handlePlayerAction('host-local-player', { action: 'TOGGLE_PLAY' });
  });

  await expect.poll(() => playRequests.length).toBe(1);
  expect(playRequests[0]).toEqual({
    url: expect.stringContaining('device_id=party-browser-device'),
    body: JSON.stringify({ uris: [TRACK_URI] }),
  });
  await expect.poll(() => page.evaluate(() => eval('gameState'))).toBe('PLAYING');
});

test('Jam.html transfers playback to the chosen device and cleans up its polling loop', async ({ page }) => {
  const transfers: string[] = [];

  await page.route('https://api.spotify.com/v1/me/player', async (route) => {
    if (route.request().method() === 'PUT') {
      transfers.push(route.request().postData() || '');
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_playing: false }) });
  });

  await page.goto('/Jam.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    window.Peer = class { on() {} destroy() {} };
    eval("accessToken = 'jam-test-token'; gameState = 'READY_TO_PLAY';");
    await selectPlaybackDevice('jam-phone-device');
  });

  await expect.poll(() => transfers.length).toBe(1);
  expect(transfers[0]).toBe(JSON.stringify({ device_ids: ['jam-phone-device'], play: false }));
  await expect.poll(() => page.evaluate(() => eval('webDeviceId'))).toBe('jam-phone-device');
  await expect.poll(() => page.evaluate(() => eval('spotifyPollInterval !== null'))).toBe(true);

  await page.evaluate(() => resetApp());
  await expect.poll(() => page.evaluate(() => eval('spotifyPollInterval'))).toBeNull();
});

test('Jam.html starts and pauses the selected track on the external device', async ({ page }) => {
  const requests: Array<{ method: string; url: string; body: string | null }> = [];

  await page.route('https://api.spotify.com/v1/me/player/play*', async (route) => {
    requests.push({ method: route.request().method(), url: route.request().url(), body: route.request().postData() });
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('https://api.spotify.com/v1/me/player/pause*', async (route) => {
    requests.push({ method: route.request().method(), url: route.request().url(), body: route.request().postData() });
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/Jam.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    eval("players = { 'host-local-player': { id: 'host-local-player', name: 'Host DJ', conn: null, online: true, tokens: 2, score: 0, timeline: [] } }");
    eval("turnOrder = ['host-local-player']; turnIndex = 0; gameState = 'READY_TO_PLAY';");
    eval("currentHostTrack = { u: 'spotify:track:playback-test', t: 'Playback Test', a: 'Hitster', y: 2024, c: '' };");
    eval("webDeviceId = 'jam-phone-device'; isPlaying = false;");
    handlePlayerAction('host-local-player', { action: 'TOGGLE_PLAY' });
  });

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({
    method: 'PUT',
    url: expect.stringContaining('device_id=jam-phone-device'),
    body: JSON.stringify({ uris: [TRACK_URI] }),
  });

  await page.evaluate(() => handlePlayerAction('host-local-player', { action: 'TOGGLE_PLAY' }));
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual({
    method: 'PUT',
    url: expect.stringContaining('device_id=jam-phone-device'),
    body: null,
  });
});
