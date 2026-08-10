import { test, expect } from '@playwright/test';

const accessToken = process.env.SPOTIFY_ACCESS_TOKEN;
const deviceId = process.env.SPOTIFY_DEVICE_ID;
const trackUri = process.env.SPOTIFY_TEST_TRACK_URI;
const playbackTestEnabled = process.env.RUN_SPOTIFY_PLAYBACK_TEST === '1';

const headers = () => ({ Authorization: `Bearer ${accessToken}` });
const successfulStatus = (status: number) => [200, 202, 204].includes(status);

test('plays and pauses a configured Spotify test track on a real device', async ({ request }) => {
  test.skip(
    !playbackTestEnabled || !accessToken || !deviceId || !trackUri,
    'Set RUN_SPOTIFY_PLAYBACK_TEST=1, SPOTIFY_ACCESS_TOKEN, SPOTIFY_DEVICE_ID, and SPOTIFY_TEST_TRACK_URI to run real playback.',
  );

  const transfer = await request.put('https://api.spotify.com/v1/me/player', {
    headers: { ...headers(), 'Content-Type': 'application/json' },
    data: { device_ids: [deviceId], play: false },
  });
  expect(successfulStatus(transfer.status())).toBe(true);

  try {
    const play = await request.put(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      headers: { ...headers(), 'Content-Type': 'application/json' },
      data: { uris: [trackUri] },
    });
    expect(successfulStatus(play.status())).toBe(true);

    await expect.poll(async () => {
      const state = await request.get('https://api.spotify.com/v1/me/player', { headers: headers() });
      if (!state.ok()) return { isPlaying: false, uri: null };
      const body = await state.json();
      return { isPlaying: body.is_playing === true, uri: body.item?.uri || null };
    }, { timeout: 20_000 }).toEqual({ isPlaying: true, uri: trackUri });
  } finally {
    const pause = await request.put(`https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, {
      headers: headers(),
    });
    expect(successfulStatus(pause.status())).toBe(true);
  }
});
