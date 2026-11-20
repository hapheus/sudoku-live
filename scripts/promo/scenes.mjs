import { randomUUID } from 'node:crypto';
import { createSudokuGame, fillCandidateNotes, serializeGameState, setCellValue } from '../../src/domain/sudoku-engine.js';
import { promoClockOffsetInitScript } from './audio-capture.js';

function createSeededGame({
    variant = '3x3',
    difficulty = 'medium',
    fillFraction = 0.35,
    leaveRowZeroAlmostComplete = false,
    withNotes = false,
} = {}) {
    let game = createSudokuGame({ variant, difficulty });
    const rowZeroEmpty = [];
    const otherEmpty = [];

    for (let i = 0; i < game.board.length; i += 1) {
        if (game.board[i] === 0) {
            if (i < 9) {
                rowZeroEmpty.push(i);
            } else {
                otherEmpty.push(i);
            }
        }
    }

    if (leaveRowZeroAlmostComplete && rowZeroEmpty.length > 2) {
        const toFill = rowZeroEmpty.slice(0, rowZeroEmpty.length - 2);
        for (const cell of toFill) {
            game = setCellValue(game, cell, game.solution[cell], { recordHistory: false });
        }
    }

    const stride = Math.max(2, Math.round(1 / Math.max(0.1, fillFraction)));
    for (const [idx, cell] of otherEmpty.entries()) {
        if (idx % stride === 0) {
            game = setCellValue(game, cell, game.solution[cell], { recordHistory: false });
        }
    }

    if (withNotes) {
        game = fillCandidateNotes(game);
    }

    const remainingEmpty = [];
    for (let i = 0; i < game.board.length; i += 1) {
        if (game.board[i] === 0) {
            remainingEmpty.push({ index: i, digit: game.solution[i] });
        }
    }

    return {
        game,
        remainingEmpty,
        snapshotJson: (roomId = randomUUID()) => JSON.stringify({
            gameState: serializeGameState(game),
            roomId,
        }),
    };
}

async function waitVisible(page, selector, timeout = 15000) {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
}

async function enterCellDigit(page, index, digit) {
    await page.locator(`[role="gridcell"][data-index="${index}"]`).click();
    await page.waitForTimeout(120);
    await page.locator(`.numpad-btn[data-digit="${digit}"]`).click();
}

async function shiftCell(page, index, buttonId) {
    await page.locator(`[role="gridcell"][data-index="${index}"]`).click();
    await page.waitForTimeout(100);
    await page.locator(buttonId).click();
}

export const PROMO_SCENES = [
    {
        id: '01-setup',
        title: 'Setup - kurz',
        theme: 'light',
        requiresBroker: false,
        storage: () => ({
            sudoku_solo_snapshot_v1: null,
        }),
        async run({ page, baseUrl, startRecording, stopRecording }) {
            await page.goto(baseUrl);
            await waitVisible(page, '#play-setup');
            await page.waitForTimeout(250);

            await startRecording();
            await page.waitForTimeout(550);

            await page.locator('label.variant-label:has(input[value="2x3"])').click();
            await page.waitForTimeout(550);
            await page.locator('label.variant-label:has(input[value="3x3"])').click();
            await page.waitForTimeout(450);

            await page.locator('label.difficulty-label:has(input[value="hard"])').click();
            await page.waitForTimeout(450);
            await page.locator('label.difficulty-label:has(input[value="medium"])').click();
            await page.waitForTimeout(450);

            await page.locator('#start-game-btn').click();
            await waitVisible(page, '#sudoku-board .sudoku-cell');
            await page.waitForTimeout(850);

            await stopRecording();
        },
    },

    {
        id: '02-game-peaceful',
        title: 'Spiel - friedlich kennt jeder',
        theme: 'light',
        requiresBroker: false,
        prepare() {
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'medium',
                fillFraction: 0.35,
                leaveRowZeroAlmostComplete: true,
            });
            return {
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(),
                },
            };
        },
        async run({ page, baseUrl, startRecording, stopRecording, state }) {
            const { seeded } = state;
            const rowZeroTargets = seeded.remainingEmpty.filter((cell) => cell.index < 9);
            const extraTargets = seeded.remainingEmpty.filter((cell) => cell.index >= 9).slice(0, 3);

            await page.goto(baseUrl);
            await (await waitVisible(page, '#resume-game-btn')).click();
            await waitVisible(page, '#sudoku-board .sudoku-cell');
            await page.waitForTimeout(300);

            await startRecording();
            await page.waitForTimeout(500);

            // Toggle notes briefly on one cell, then turn off and fill peaceful digits
            if (extraTargets[0]) {
                await page.locator(`[role="gridcell"][data-index="${extraTargets[0].index}"]`).click();
                await page.waitForTimeout(350);
                await page.locator('#notes-btn').click();
                await page.waitForTimeout(250);
                await page.locator(`.numpad-btn[data-digit="${extraTargets[0].digit}"]`).click();
                await page.waitForTimeout(400);
                await page.locator('#notes-btn').click();
                await page.waitForTimeout(250);
            }

            // Complete row 0 to trigger peaceful unit completion shimmer + chime
            for (const target of rowZeroTargets) {
                await enterCellDigit(page, target.index, target.digit);
                await page.waitForTimeout(650);
            }

            if (extraTargets[1]) {
                await enterCellDigit(page, extraTargets[1].index, extraTargets[1].digit);
                await page.waitForTimeout(750);
            }

            await stopRecording();
        },
    },

    {
        id: '03-game-shift',
        title: 'Spiel - friedlich Shift (1st Feature)',
        theme: 'light',
        requiresBroker: false,
        prepare() {
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'medium',
                fillFraction: 0.45,
            });
            return {
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(),
                },
            };
        },
        async run({ page, baseUrl, startRecording, stopRecording }) {
            await page.goto(baseUrl);
            await (await waitVisible(page, '#resume-game-btn')).click();
            await waitVisible(page, '#sudoku-board .sudoku-cell');
            await page.waitForTimeout(300);

            await startRecording();
            await page.waitForTimeout(550);

            await page.locator('[role="gridcell"][data-index="12"]').click();
            await page.waitForTimeout(550);
            await page.locator('#shift-row-down-btn').click();
            await page.waitForTimeout(900);

            await page.locator('#shift-col-right-btn').click();
            await page.waitForTimeout(900);

            await page.locator('[role="gridcell"][data-index="40"]').click();
            await page.waitForTimeout(450);
            await page.locator('#shift-row-up-btn').click();
            await page.waitForTimeout(850);

            await page.locator('#shift-col-left-btn').click();
            await page.waitForTimeout(850);

            await stopRecording();
        },
    },

    {
        id: '04-watch-zen',
        title: 'Watch - friedlich Zen, nur geniessen, nichts machen',
        theme: 'light',
        requiresBroker: true,
        prepare() {
            const roomId = `promo-zen-${Date.now()}`;
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'medium',
                fillFraction: 0.6,
                leaveRowZeroAlmostComplete: true,
            });
            return {
                roomId,
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: null,
                    sudoku_player_name: 'ZenViewer',
                },
            };
        },
        async run({ page, baseUrl, createPeerPage, startRecording, stopRecording, state }) {
            const { roomId, seeded } = state;
            const host = await createPeerPage({
                name: 'CalmArtist',
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(roomId),
                    sudoku_joins_auto_accept: 'true',
                },
            });

            await host.goto(baseUrl);
            await (await waitVisible(host, '#resume-game-btn')).click();
            await waitVisible(host, '#sudoku-board .sudoku-cell');
            await host.waitForTimeout(600);

            await page.goto(baseUrl);
            await (await waitVisible(page, '#nav-watch')).click();
            await waitVisible(page, `[data-watch-id="${roomId}"]`);
            await page.waitForTimeout(250);

            await startRecording();
            await page.waitForTimeout(950);

            // Enter peaceful watch view and simply observe
            await page.locator(`[data-watch-id="${roomId}"]`).click();
            await waitVisible(page, '#sudoku-board .sudoku-cell');
            await waitVisible(page, '#exit-watch-btn');
            await page.waitForTimeout(900);

            const moves = [
                ...seeded.remainingEmpty.filter((cell) => cell.index >= 9).slice(0, 2),
                ...seeded.remainingEmpty.filter((cell) => cell.index < 9),
            ];
            for (const move of moves) {
                await enterCellDigit(host, move.index, move.digit);
                await page.waitForTimeout(1050);
            }

            await page.waitForTimeout(700);
            await stopRecording();
        },
    },

    {
        id: '05-join-peaceful',
        title: 'Join - friedlich',
        theme: 'light',
        requiresBroker: true,
        prepare() {
            const roomId = `promo-join-${Date.now()}`;
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'medium',
                fillFraction: 0.4,
            });
            return {
                roomId,
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: null,
                    sudoku_player_name: 'SunnyGuest',
                },
            };
        },
        async run({ page, baseUrl, createPeerPage, startRecording, stopRecording, state }) {
            const { roomId, seeded } = state;
            const host = await createPeerPage({
                name: 'HostRiver',
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(roomId),
                    sudoku_joins_auto_accept: 'false',
                },
            });

            await host.goto(baseUrl);
            await (await waitVisible(host, '#resume-game-btn')).click();
            await waitVisible(host, '#sudoku-board .sudoku-cell');
            await host.waitForTimeout(700);

            await page.goto(`${baseUrl}/?game=${roomId}&watch=1`);
            await waitVisible(page, '#join-from-watch-btn');
            await page.waitForTimeout(500);

            await startRecording();
            await page.waitForTimeout(600);

            await page.locator('#join-from-watch-btn').click();
            await (await waitVisible(host, '#accept-join-btn')).click();

            await waitVisible(page, '#player-controls');
            await page.waitForTimeout(600);

            const [guestMove, hostMove1, guestMove2] = seeded.remainingEmpty;
            if (hostMove1) {
                await host.locator(`[role="gridcell"][data-index="${hostMove1.index}"]`).click();
                await page.waitForTimeout(450);
            }
            if (guestMove) {
                await enterCellDigit(page, guestMove.index, guestMove.digit);
                await page.waitForTimeout(700);
            }
            if (hostMove1) {
                await enterCellDigit(host, hostMove1.index, hostMove1.digit);
                await page.waitForTimeout(650);
            }
            if (guestMove2) {
                await enterCellDigit(page, guestMove2.index, guestMove2.digit);
                await page.waitForTimeout(700);
            }

            await stopRecording();
        },
    },

    {
        id: '06-chaos-cursors-shift',
        title: 'CHAOS: 2-3 Spieler - viele Cursor sichtbar, es wird geshiftet',
        theme: 'light',
        requiresBroker: true,
        prepare() {
            const roomId = `promo-chaos-${Date.now()}`;
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'medium',
                fillFraction: 0.45,
            });
            return {
                roomId,
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: null,
                    sudoku_player_name: 'ChaosOne',
                },
            };
        },
        async run({ page, baseUrl, createPeerPage, startRecording, stopRecording, state }) {
            const { roomId, seeded } = state;
            const host = await createPeerPage({
                name: 'ChaosHost',
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(roomId),
                    sudoku_joins_auto_accept: 'true',
                },
            });
            const guest2 = await createPeerPage({
                name: 'ChaosThree',
                storage: {
                    sudoku_solo_snapshot_v1: null,
                },
            });

            await host.goto(baseUrl);
            await (await waitVisible(host, '#resume-game-btn')).click();
            await waitVisible(host, '#sudoku-board .sudoku-cell');
            await host.waitForTimeout(700);

            await page.goto(`${baseUrl}/?game=${roomId}&watch=1`);
            await (await waitVisible(page, '#join-from-watch-btn')).click();
            await waitVisible(page, '#player-controls');

            await guest2.goto(`${baseUrl}/?game=${roomId}&watch=1`);
            await (await waitVisible(guest2, '#join-from-watch-btn')).click();
            await waitVisible(guest2, '#player-controls');

            // Ensure all 3 players are live in the channel before starting recording
            await host.locator('[role="gridcell"][data-index="10"]').click();
            await guest2.locator('[role="gridcell"][data-index="50"]').click();
            await page.waitForTimeout(450);

            await startRecording();

            const moves = seeded.remainingEmpty;
            const cursorSteps = [
                async () => {
                    await host.locator('[role="gridcell"][data-index="20"]').click();
                    await guest2.locator('[role="gridcell"][data-index="60"]').click();
                    await page.locator('[role="gridcell"][data-index="30"]').click();
                },
                async () => {
                    await shiftCell(host, 10, '#shift-row-down-btn');
                    await page.waitForTimeout(160);
                    await guest2.locator('[role="gridcell"][data-index="75"]').click();
                    await shiftCell(page, 40, '#shift-col-right-btn');
                },
                async () => {
                    if (moves[0]) await enterCellDigit(page, moves[0].index, moves[0].digit);
                    await host.locator('[role="gridcell"][data-index="4"]').click();
                    await shiftCell(guest2, 68, '#shift-row-up-btn');
                },
                async () => {
                    await shiftCell(host, 24, '#shift-col-left-btn');
                    await page.waitForTimeout(150);
                    if (moves[2]) await enterCellDigit(guest2, moves[2].index, moves[2].digit);
                    await page.locator('[role="gridcell"][data-index="52"]').click();
                },
                async () => {
                    await shiftCell(page, 14, '#shift-row-up-btn');
                    await host.locator('[role="gridcell"][data-index="70"]').click();
                    await page.waitForTimeout(150);
                    await shiftCell(guest2, 33, '#shift-col-right-btn');
                },
                async () => {
                    if (moves[4]) {
                        const wrongDigit = (moves[4].digit % 9) + 1;
                        await enterCellDigit(page, moves[4].index, wrongDigit);
                    }
                    await shiftCell(host, 46, '#shift-row-down-btn');
                    await guest2.locator('[role="gridcell"][data-index="18"]').click();
                },
                async () => {
                    await shiftCell(page, 58, '#shift-col-left-btn');
                    await host.locator('[role="gridcell"][data-index="35"]').click();
                    await shiftCell(guest2, 5, '#shift-row-down-btn');
                },
            ];

            for (const step of cursorSteps) {
                await step();
                await page.waitForTimeout(420);
            }

            await page.waitForTimeout(500);
            await stopRecording();
        },
    },

    {
        id: '07-chaos-night-ghost',
        title: 'CHAOS: Ein Geist erscheint und tauscht',
        theme: 'light',
        requiresBroker: false,
        extraInitScript: promoClockOffsetInitScript(4.2),
        prepare() {
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'medium',
                fillFraction: 0.45,
            });
            return {
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(),
                },
            };
        },
        async run({ page, baseUrl, startRecording, stopRecording, state }) {
            const { seeded } = state;

            await page.goto(baseUrl);
            await (await waitVisible(page, '#resume-game-btn')).click();
            await waitVisible(page, '#sudoku-board .sudoku-cell');

            await startRecording();

            // Place one calm digit right before midnight hits
            if (seeded.remainingEmpty[0]) {
                await page.waitForTimeout(400);
                await enterCellDigit(page, seeded.remainingEmpty[0].index, seeded.remainingEmpty[0].digit);
            }

            await waitVisible(page, '.night-ghost', 10000);
            await page.locator('.night-ghost').waitFor({ state: 'detached', timeout: 12000 });
            await page.waitForTimeout(900);

            await stopRecording();
        },
    },

    {
        id: '08-chaos-tic-tac-toe',
        title: 'CHAOS: 2 Spieler shiften und spielen Tic Tac Toe',
        theme: 'light',
        requiresBroker: true,
        prepare() {
            const roomId = `promo-ttt-${Date.now()}`;
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'medium',
                fillFraction: 0.4,
            });
            return {
                roomId,
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(roomId),
                    sudoku_joins_auto_accept: 'true',
                    sudoku_player_name: 'ShiftDuelX',
                },
            };
        },
        async run({ page, baseUrl, createPeerPage, startRecording, stopRecording, state }) {
            const { roomId } = state;
            const guest = await createPeerPage({
                name: 'ShiftDuelO',
                storage: {
                    sudoku_solo_snapshot_v1: null,
                },
            });

            await page.goto(baseUrl);
            await (await waitVisible(page, '#resume-game-btn')).click();
            await waitVisible(page, '#sudoku-board .sudoku-cell');
            await page.waitForTimeout(700);

            await guest.goto(`${baseUrl}/?game=${roomId}&watch=1`);
            await (await waitVisible(guest, '#join-from-watch-btn')).click();
            await waitVisible(guest, '#player-controls');
            await page.waitForTimeout(350);

            await startRecording();
            await page.waitForTimeout(350);

            // Mutual undo-shifts to trigger Tic Tac Toe
            await shiftCell(page, 0, '#shift-row-down-btn');
            await page.waitForTimeout(360);
            await shiftCell(guest, 9, '#shift-row-up-btn');
            await page.waitForTimeout(360);
            await shiftCell(page, 0, '#shift-row-down-btn');
            await page.waitForTimeout(360);
            await shiftCell(guest, 9, '#shift-row-up-btn');

            await waitVisible(page, '.tic-tac-toe__board', 8000);
            await page.waitForTimeout(450);

            // Play a 9-move draw: O X X / X X O / O O X
            const moves = [
                [page, 4],
                [guest, 0],
                [page, 2],
                [guest, 6],
                [page, 3],
                [guest, 5],
                [page, 1],
                [guest, 7],
                [page, 8],
            ];
            for (const [actor, cellIndex] of moves) {
                await actor.locator('.tic-tac-toe__board .tic-tac-toe__cell').nth(cellIndex).click();
                await page.waitForTimeout(340);
            }

            // Wait for draw banner + return back to Sudoku
            await waitVisible(page, '#sudoku-board .sudoku-cell', 10000);
            await page.waitForTimeout(900);

            await stopRecording();
        },
    },

    {
        id: '09-dark-mode',
        title: 'Dark Mode',
        theme: 'dark',
        requiresBroker: false,
        prepare() {
            const seeded = createSeededGame({
                variant: '3x3',
                difficulty: 'hard',
                fillFraction: 0.42,
            });
            return {
                seeded,
                storage: {
                    sudoku_solo_snapshot_v1: seeded.snapshotJson(),
                },
            };
        },
        async run({ page, baseUrl, startRecording, stopRecording, state }) {
            const { seeded } = state;

            await page.goto(baseUrl);
            await waitVisible(page, '#play-setup');
            await page.waitForTimeout(250);

            await startRecording();
            await page.waitForTimeout(750);

            await page.locator('#resume-game-btn').click();
            await waitVisible(page, '#sudoku-board .sudoku-cell');
            await page.waitForTimeout(550);

            if (seeded.remainingEmpty[0]) {
                await enterCellDigit(page, seeded.remainingEmpty[0].index, seeded.remainingEmpty[0].digit);
                await page.waitForTimeout(550);
            }
            if (seeded.remainingEmpty[1]) {
                await enterCellDigit(page, seeded.remainingEmpty[1].index, seeded.remainingEmpty[1].digit);
                await page.waitForTimeout(550);
            }

            await shiftCell(page, 21, '#shift-row-down-btn');
            await page.waitForTimeout(700);
            await page.locator('#shift-col-right-btn').click();
            await page.waitForTimeout(850);

            await stopRecording();
        },
    },
];
