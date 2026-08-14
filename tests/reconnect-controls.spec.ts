import { test, expect } from '@playwright/test';

const ROOT = 'file:///C:/Users/User/Documents/Codex/2026-08-10/w/outputs/test-run';

for (const game of ['party.html', 'Jam.html']) {
  test(`${game} cancels a queued reconnect immediately`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      const callbacks = [];
      const cleared = [];
      const originalSetTimeout = window.setTimeout;
      const originalClearTimeout = window.clearTimeout;
      window.setTimeout = ((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }) as typeof window.setTimeout;
      window.clearTimeout = ((id) => { cleared.push(id); }) as typeof window.clearTimeout;

      localStorage.setItem('party_last_pin', '1234');
      localStorage.setItem('party_player_name', 'Alice');
      reconnectEnabled = true;
      reconnectAttempts = 0;
      reconnectTimer = null;
      const beforeCancel = clientConnectionAttempt;
      schedulePlayerReconnect();
      const queuedReconnect = callbacks[0];

      cancelPlayerReconnect();
      queuedReconnect();

      const state = {
        reconnectEnabled,
        reconnectAttempts,
        reconnectTimer,
        connectionAttemptAdvanced: clientConnectionAttempt > beforeCancel,
        queuedTimerCleared: cleared.includes(1),
        peerWasNotRecreated: myPeer === null,
        cancelledStatus: document.getElementById('player-status').textContent,
      };
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
      return state;
    });

    expect(result.reconnectEnabled).toBe(false);
    expect(result.reconnectAttempts).toBe(0);
    expect(result.reconnectTimer).toBeNull();
    expect(result.connectionAttemptAdvanced).toBe(true);
    expect(result.queuedTimerCleared).toBe(true);
    expect(result.peerWasNotRecreated).toBe(true);
    expect(result.cancelledStatus).toContain('Reconnection cancelled');
  });

  test(`${game} retries quickly instead of waiting several seconds between attempts`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      const delays = [];
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = ((callback, delay) => {
        delays.push(delay);
        return 1;
      }) as typeof window.setTimeout;

      localStorage.setItem('party_last_pin', '1234');
      reconnectEnabled = true;
      reconnectAttempts = 0;
      reconnectTimer = null;
      schedulePlayerReconnect();

      window.setTimeout = originalSetTimeout;
      return { delays, timeout: HOST_CONNECTION_TIMEOUT_MS };
    });

    expect(result.delays).toEqual([250]);
    expect(result.timeout).toBe(4000);
  });

  test(`${game} stops automatic reconnects after three attempts`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      localStorage.setItem('party_last_pin', '1234');
      reconnectEnabled = true;
      reconnectAttempts = MAX_AUTO_RECONNECT_ATTEMPTS;
      reconnectTimer = null;
      schedulePlayerReconnect();
      return {
        reconnectEnabled,
        reconnectTimer,
        status: document.getElementById('player-status').textContent,
      };
    });

    expect(result.reconnectEnabled).toBe(false);
    expect(result.reconnectTimer).toBeNull();
    expect(result.status).toContain("Couldn't reconnect");
  });

  test(`${game} explains when the room is found but the host cannot be reached`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      showHostConnectionProblem();
      return {
        status: document.getElementById('player-status').textContent,
        toast: document.getElementById('toast-container').textContent,
      };
    });

    expect(result.status).toContain("Found the room, but couldn't connect to the host");
    expect(result.toast).toContain('network connection problem');
  });
}
