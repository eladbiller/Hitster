import { test, expect } from '@playwright/test';

const ROOT = 'file:///C:/Users/User/Documents/Codex/2026-08-10/w/outputs/test-run';

for (const game of ['party.html', 'Jam.html']) {
  test(`${game} hides steal controls and ignores a pass when the player has no tokens`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      myPlayerName = 'Bob';
      const stealSync = {
        state: 'STEALING', isPlaying: false, activePlayerName: 'Alice', isActivePlayer: false,
        timeline: [], ownTimeline: [], guesses: {}, hasPassedSteal: false, hasStealed: false,
        allStealsDone: false, waitingOn: ['Carol'], stealTimeLeft: 12, myScore: 0,
        myTokens: 0, myCardsCount: 1, activePlayerCardsCount: 1, activePlayerTokens: 2,
        correctYear: null, trackTitle: null, artistName: null, isWinner: false,
        bonusTokenClaimed: false, overallWinnerName: null, winnerName: null,
      };
      handlePlayerSync(stealSync);
      const passHiddenWithZeroTokens = document.getElementById('p-steal-pass-control').classList.contains('hidden');
      delete stealSync.myTokens;
      handlePlayerSync(stealSync);

      players = {
        'host-local-player': { id: 'host-local-player', name: 'Host', online: true, tokens: 2, score: 0, timeline: [] },
        alice: { id: 'alice', name: 'Alice', online: true, tokens: 2, score: 0, timeline: [] },
        bob: { id: 'bob', name: 'Bob', online: true, tokens: 0, score: 0, timeline: [] },
      };
      turnOrder = ['alice', 'bob', 'host-local-player'];
      turnIndex = 0;
      gameState = 'STEALING';
      stealDecisions = {};
      handlePlayerAction('bob', { action: 'PASS_STEAL' });

      return {
        passHiddenWithZeroTokens,
        passHiddenWithMissingTokenCount: document.getElementById('p-steal-pass-control').classList.contains('hidden'),
        header: document.getElementById('p-ui-desc').textContent,
        passIgnored: !Object.prototype.hasOwnProperty.call(stealDecisions, 'bob'),
      };
    });

    expect(result.passHiddenWithZeroTokens).toBe(true);
    expect(result.passHiddenWithMissingTokenCount).toBe(true);
    expect(result.header).toContain('No steal tokens left');
    expect(result.passIgnored).toBe(true);
  });

  test(`${game} lets the host replace the active song before it is guessed`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      players = {
        'host-local-player': { id: 'host-local-player', name: 'Host', online: true, tokens: 2, score: 0, timeline: [] },
        alice: { id: 'alice', name: 'Alice', online: true, tokens: 2, score: 0, timeline: [] },
      };
      turnOrder = ['alice', 'host-local-player'];
      turnIndex = 0;
      gameState = 'PLAYING';
      isPlaying = true;
      currentHostTrack = { u: 'spotify:track:old', t: 'Old Song', a: 'Artist', y: 1999, c: '' };
      tracks = Array.from({ length: 15 }, (_, index) => ({
        u: `spotify:track:${index}`, t: `Song ${index}`, a: 'Artist', y: 2000 + index, c: '',
      }));
      spotifyPlayer = { pause: () => { window.__pauseCalls = (window.__pauseCalls || 0) + 1; } };

      handlePlayerAction('host-local-player', { action: 'SKIP_SONG' });

      return {
        state: gameState,
        isPlaying,
        activePlayer: turnOrder[turnIndex],
        replacementUri: currentHostTrack.u,
        pauseCalls: window.__pauseCalls,
      };
    });

    expect(result).toEqual({
      state: 'READY_TO_PLAY',
      isPlaying: false,
      activePlayer: 'alice',
      replacementUri: 'spotify:track:14',
      pauseCalls: 1,
    });
  });
}
