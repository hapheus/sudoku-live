import { isValidGameId } from '../services/online-game-client.js';

const DIFFICULTY_LABELS = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    expert: 'Expert',
};

/**
 * Safe DOM-based renderer for the Live Sudoku Games Watch Directory (XSS-safe).
 */
export class LobbyView {
    constructor({ containerElement, onWatchGame }) {
        this.containerElement = containerElement;
        this.onWatchGame = onWatchGame || (() => {});
    }

    render(members = []) {
        if (!this.containerElement) return;

        const seenGameIds = new Set();
        const liveGames = [];

        for (const member of members || []) {
            if (!member || !isValidGameId(member.game_id) || member.status === 'solved' || member.status === 'finished') {
                continue;
            }
            if (seenGameIds.has(member.game_id)) {
                continue;
            }
            seenGameIds.add(member.game_id);
            liveGames.push(member);
        }

        this.containerElement.replaceChildren();

        if (liveGames.length === 0) {
            const emptyBox = document.createElement('div');
            emptyBox.className = 'watch-empty';

            const title = document.createElement('p');
            title.className = 'live-game-card__meta';
            title.textContent = 'No live Sudoku matches right now.';

            const subtitle = document.createElement('p');
            subtitle.className = 'watch-empty__sub';
            subtitle.textContent = 'Start a Solo or Online Co-op game and it will appear here in real time.';

            emptyBox.append(title, subtitle);
            this.containerElement.appendChild(emptyBox);
            return;
        }

        const fragment = document.createDocumentFragment();

        for (const game of liveGames) {
            const card = document.createElement('div');
            card.className = 'live-game-card';

            const info = document.createElement('div');
            info.className = 'live-game-card__info';

            const title = document.createElement('span');
            title.className = 'live-game-card__title';
            title.textContent = `Room #${game.game_id.slice(0, 8)}`;

            const filledCount = Math.max(0, Math.min(81, parseInt(game.filled_count ?? game.moves_count ?? 0, 10) || 0));
            const diffLabel = DIFFICULTY_LABELS[game.difficulty] || 'Medium';
            const modeLabel = game.game_mode === 'solo' ? 'Solo' : 'Co-op';
            const statusLabel = game.status === 'waiting' && game.game_mode !== 'solo'
                ? 'Waiting for partner'
                : 'Solving live';

            const meta = document.createElement('span');
            meta.className = 'live-game-card__meta';
            meta.textContent = `${modeLabel} • ${diffLabel} • ${statusLabel} • ${filledCount}/81`;

            info.append(title, meta);

            const actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            actionBtn.className = 'live-game-card__action-btn';
            actionBtn.dataset.watchId = game.game_id;
            actionBtn.textContent = 'Watch Live';
            actionBtn.addEventListener('click', () => {
                this.onWatchGame(game.game_id);
            });

            card.append(info, actionBtn);
            fragment.appendChild(card);
        }

        this.containerElement.appendChild(fragment);
    }
}
