import { test, expect } from '@playwright/test';

const JAM_URL = 'file:///C:/Users/User/Documents/Codex/2026-08-10/w/outputs/test-run/Jam.html';

test('Jam ignores stale client socket events after a browser reconnect', async ({ page }) => {
  await page.goto(JAM_URL, { waitUntil: 'domcontentloaded' });

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

test('Jam restores a full steal timer when the paused player reconnects', async ({ page }) => {
  await page.goto(JAM_URL, { waitUntil: 'domcontentloaded' });

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

    players = {
      'host-local-player': { id: 'host-local-player', name: 'Host DJ', conn: null, online: true, tokens: 2, score: 0, timeline: [], lastPongAt: Date.now() },
      alice: { id: 'alice', name: 'Alice', conn: null, online: false, reconnectToken: 'alice-token', tokens: 2, score: 0, timeline: [], lastPongAt: Date.now() - 6000 },
    };
    turnOrder = ['host-local-player', 'alice'];
    turnIndex = 0;
    gameState = 'PAUSED_DISCONNECT';
    previousStateBeforePause = 'STEALING';
    pendingDisconnectPlayerId = 'alice';
    stealEndTime = Date.now() - 1000;
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
