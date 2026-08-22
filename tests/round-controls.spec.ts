import { test, expect } from '@playwright/test';

const ROOT = '';

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

  test(`${game} enlarges active-player counters and offers Continue Listening only to the active player`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      myPlayerName = 'Bob';
      const stealSync = {
        state: 'STEALING', isPlaying: false, activePlayerName: 'Alice', isActivePlayer: false,
        timeline: [], ownTimeline: [], guesses: {}, hasPassedSteal: false, hasStealed: false,
        allStealsDone: false, waitingOn: ['Bob'], stealTimeLeft: 12, myScore: 0,
        myTokens: 2, myCardsCount: 3, activePlayerCardsCount: 1, activePlayerTokens: 2,
        correctYear: null, trackTitle: null, artistName: null, isWinner: false,
        bonusTokenClaimed: false, overallWinnerName: null, winnerName: null,
      };
      handlePlayerSync(stealSync);
      const scoreBefore = Number.parseFloat(getComputedStyle(document.getElementById('p-ui-score')).fontSize);
      const tokensBefore = Number.parseFloat(getComputedStyle(document.getElementById('p-ui-tokens')).fontSize);
      const activeTokenElement = document.querySelector('.p-active-tokens');
      activeTokenElement.style.fontSize = '12px';
      const activeTokensBefore = Number.parseFloat(getComputedStyle(activeTokenElement).fontSize);
      const listenAgainHiddenDuringSteal = document.getElementById('p-reveal-listening-control').classList.contains('hidden');
      const wideActions = document.getElementById('p-btn-pass-steal').classList.contains('w-full');
      const topPanelMatchesHeader = document.querySelector('#player-game-ui > div').classList.contains('min-h-[64px]') && document.getElementById('p-ui-header').classList.contains('min-h-[64px]');

      toggleFontSize();
      const scoreAfter = Number.parseFloat(getComputedStyle(document.getElementById('p-ui-score')).fontSize);
      const tokensAfter = Number.parseFloat(getComputedStyle(document.getElementById('p-ui-tokens')).fontSize);
      const activeTokensAfter = Number.parseFloat(getComputedStyle(activeTokenElement).fontSize);

      handlePlayerSync({ ...stealSync, state: 'REVEAL', isPlaying: false, isActivePlayer: true, winnerName: 'Alice' });
      const listenAgainVisibleForActivePlayer = !document.getElementById('p-reveal-listening-control').classList.contains('hidden');
      handlePlayerSync({ ...stealSync, state: 'REVEAL', isPlaying: false, isActivePlayer: false, winnerName: 'Alice' });
      const listenAgainHiddenForOtherPlayer = document.getElementById('p-reveal-listening-control').classList.contains('hidden');
      handlePlayerSync({ ...stealSync, state: 'REVEAL', isPlaying: true, isActivePlayer: true, winnerName: 'Alice' });
      const listenAgainHiddenWhilePlaying = document.getElementById('p-reveal-listening-control').classList.contains('hidden');
      const continueListeningLabel = document.getElementById('p-btn-reveal-listen').textContent.trim();

      return { scoreBefore, tokensBefore, activeTokensBefore, scoreAfter, tokensAfter, activeTokensAfter, listenAgainHiddenDuringSteal, listenAgainVisibleForActivePlayer, listenAgainHiddenForOtherPlayer, listenAgainHiddenWhilePlaying, continueListeningLabel, wideActions, topPanelMatchesHeader };
    });

    expect(result.scoreAfter).toBeGreaterThan(result.scoreBefore);
    expect(result.tokensAfter).toBeGreaterThan(result.tokensBefore);
    expect(result.activeTokensAfter).toBeGreaterThan(result.activeTokensBefore);
    expect(result.listenAgainHiddenDuringSteal).toBe(true);
    expect(result.listenAgainVisibleForActivePlayer).toBe(true);
    expect(result.listenAgainHiddenForOtherPlayer).toBe(true);
    expect(result.listenAgainHiddenWhilePlaying).toBe(true);
    expect(result.continueListeningLabel).toContain('Continue Listening');
    expect(result.wideActions).toBe(true);
    expect(result.topPanelMatchesHeader).toBe(true);
  });

  test(`${game} changes screen-control color immediately and creates a scannable lobby QR join link`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      currentRoomPin = 4321;
      gameState = 'IDLE';
      updateHostJoinQr();
      const qrCard = document.getElementById('host-join-qr-card');
      const qrLink = new URL(document.getElementById('host-join-link').href);
      const qrVisibleInLobby = !qrCard.classList.contains('hidden');
      const qrImageAlt = document.querySelector('#host-join-qr img')?.getAttribute('alt');
      const accessibilityButton = document.getElementById('accessibility-toggle');
      const fullscreenButton = document.getElementById('fullscreen-toggle');
      toggleFontSize();
      const accessibleState = {
        pressed: accessibilityButton.getAttribute('aria-pressed'),
        backgroundColor: accessibilityButton.style.backgroundColor,
      };
      gameState = 'READY_TO_PLAY';
      updateHostJoinQr();

      return {
        qrLinkPin: qrLink.searchParams.get('join'),
        qrVisibleInLobby,
        qrImageAlt,
        qrSizeClass: document.getElementById('host-join-qr').classList.contains('w-48'),
        qrSource: document.querySelector('#host-join-qr img')?.getAttribute('src'),
        qrHiddenAfterStart: qrCard.classList.contains('hidden'),
        accessibleState,
        accessibilityIndicatorPresent: Boolean(document.getElementById('accessibility-indicator')),
        fullscreenPressed: fullscreenButton.getAttribute('aria-pressed'),
        fullscreenIndicatorPresent: Boolean(document.getElementById('fullscreen-indicator')),
      };
    });

    expect(result.qrLinkPin).toBe('4321');
    expect(result.qrVisibleInLobby).toBe(true);
    expect(result.qrImageAlt).toContain('4321');
    expect(result.qrSizeClass).toBe(true);
    expect(result.qrSource).toContain('size=360x360');
    expect(result.qrHiddenAfterStart).toBe(true);
    expect(result.accessibleState).toEqual({ pressed: 'true', backgroundColor: 'rgb(79, 70, 229)' });
    expect(result.accessibilityIndicatorPresent).toBe(false);
    expect(result.fullscreenPressed).toBe('false');
    expect(result.fullscreenIndicatorPresent).toBe(false);
  });

  test(`${game} pre-fills a room PIN opened from the QR link`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}?join=4321`, { waitUntil: 'load' });
    await expect(page.locator('#join-pin')).toHaveValue('4321');
    await expect(page.locator('#view-player-join')).not.toHaveClass(/hidden/);
  });

  test(`${game} resumes the saved host game after returning from Spotify login`, async ({ page }) => {
    await page.goto(`${ROOT}/${game}`, { waitUntil: 'load' });

    const result = await page.evaluate(() => {
      let resumeCalls = 0;
      let newGameSetupCalls = 0;
      sessionStorage.removeItem('party_resume_after_spotify_login');
      eval('accessToken = null');
      resumeHostGame();
      const resumeIntentSet = sessionStorage.getItem('party_resume_after_spotify_login') === 'true';
      resumeHostGame = () => { resumeCalls++; };
      checkSpotifyAuthAndInitHost = () => { newGameSetupCalls++; };
      continueAfterSpotifyLogin();
      return {
        resumeCalls,
        newGameSetupCalls,
        resumeIntentSet,
        resumeIntentCleared: sessionStorage.getItem('party_resume_after_spotify_login') === null,
      };
    });

    expect(result).toEqual({ resumeCalls: 1, newGameSetupCalls: 0, resumeIntentSet: true, resumeIntentCleared: true });
  });
}

test('Party shows the final winning song and lets only the overall winner continue listening', async ({ page }) => {
  await page.goto(`${ROOT}/party.html`, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    myPlayerName = 'Alice';
    const gameOverSync = {
      state: 'GAME_OVER', isPlaying: false, activePlayerName: 'Alice', isActivePlayer: true,
      timeline: [], ownTimeline: [], guesses: {}, hasPassedSteal: false, hasStealed: false,
      allStealsDone: true, waitingOn: [], stealTimeLeft: 0, myScore: 10,
      myTokens: 2, myCardsCount: 10, activePlayerCardsCount: 10, activePlayerTokens: 2,
      correctYear: 2008, trackTitle: 'Winning Song', artistName: 'Winning Artist', isWinner: true,
      bonusTokenClaimed: false, overallWinnerName: 'Alice', winnerName: 'Alice',
    };
    handlePlayerSync(gameOverSync);
    const winnerCanListen = !document.getElementById('p-reveal-listening-control').classList.contains('hidden');
    const winningSongShown = document.getElementById('p-overlay-desc').textContent;

    players = {
      alice: { id: 'alice', name: 'Alice', online: true, tokens: 2, score: 10, timeline: [] },
      bob: { id: 'bob', name: 'Bob', online: true, tokens: 2, score: 8, timeline: [] },
    };
    turnOrder = ['alice', 'bob'];
    turnIndex = 0;
    currentWinnerId = 'alice';
    currentHostTrack = { u: 'spotify:track:winning', t: 'Winning Song', a: 'Winning Artist', y: 2008, c: '' };
    gameState = 'GAME_OVER';
    isPlaying = false;
    spotifyPlayer = { resume: () => { window.__resumeCalls = (window.__resumeCalls || 0) + 1; } };
    handlePlayerAction('alice', { action: 'RESUME_LISTENING' });
    const winnerResumed = isPlaying && window.__resumeCalls === 1;
    isPlaying = false;
    handlePlayerAction('bob', { action: 'RESUME_LISTENING' });
    const otherPlayerBlocked = window.__resumeCalls === 1 && !isPlaying;

    return { winnerCanListen, winningSongShown, winnerResumed, otherPlayerBlocked };
  });

  expect(result.winnerCanListen).toBe(true);
  expect(result.winningSongShown).toContain('Winning Song');
  expect(result.winningSongShown).toContain('Winning Artist');
  expect(result.winnerResumed).toBe(true);
  expect(result.otherPlayerBlocked).toBe(true);
});
