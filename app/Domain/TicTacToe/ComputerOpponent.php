<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

use InvalidArgumentException;
use Random\Randomizer;

final readonly class ComputerOpponent
{
    public function __construct(
        private GameRules $rules = new GameRules,
    ) {}

    public function selectMove(
        Board $board,
        Player $aiPlayer,
        AiDifficulty $difficulty,
        ?Randomizer $randomizer = null,
    ): int {
        $available = $board->availableIndices();

        if (empty($available)) {
            throw new InvalidArgumentException('Cannot select a move on a full board.');
        }

        return match ($difficulty) {
            AiDifficulty::Easy => $this->selectEasyMove($available, $randomizer),
            AiDifficulty::Medium => $this->selectMediumMove($board, $aiPlayer, $available, $randomizer),
            AiDifficulty::Hard => $this->selectHardMove($board, $aiPlayer, $available),
        };
    }

    /**
     * @param  list<int>  $available
     */
    private function selectEasyMove(array $available, ?Randomizer $randomizer): int
    {
        $randomizer = $randomizer ?? new Randomizer;
        $key = $randomizer->getInt(0, count($available) - 1);

        return $available[$key];
    }

    /**
     * @param  list<int>  $available
     */
    private function selectMediumMove(
        Board $board,
        Player $aiPlayer,
        array $available,
        ?Randomizer $randomizer,
    ): int {
        // 1. Take immediate win
        foreach ($available as $index) {
            $nextBoard = $board->withMove($index, $aiPlayer);
            if ($this->rules->checkWinner($nextBoard)?->player === $aiPlayer) {
                return $index;
            }
        }

        // 2. Block immediate opponent win
        $opponent = $aiPlayer->opponent();
        foreach ($available as $index) {
            $nextBoard = $board->withMove($index, $opponent);
            if ($this->rules->checkWinner($nextBoard)?->player === $opponent) {
                return $index;
            }
        }

        // 3. Heuristic preference: center (4), then corners (0, 2, 6, 8), then edges (1, 3, 5, 7)
        if (in_array(4, $available, true)) {
            return 4;
        }

        $corners = array_values(array_intersect([0, 2, 6, 8], $available));
        if (! empty($corners)) {
            $randomizer = $randomizer ?? new Randomizer;

            return $corners[$randomizer->getInt(0, count($corners) - 1)];
        }

        return $this->selectEasyMove($available, $randomizer);
    }

    /**
     * @param  list<int>  $available
     */
    private function selectHardMove(Board $board, Player $aiPlayer, array $available): int
    {
        // Opening optimization: on an empty board, center or corner is optimal and saves evaluating 9! states
        if (count($available) === 9) {
            return 4; // Center
        }

        $bestScore = -INF;
        $bestMove = $available[0];

        foreach ($available as $move) {
            $nextBoard = $board->withMove($move, $aiPlayer);
            $score = $this->minimax($nextBoard, 0, false, $aiPlayer);

            if ($score > $bestScore) {
                $bestScore = $score;
                $bestMove = $move;
            }
        }

        return $bestMove;
    }

    private function minimax(Board $board, int $depth, bool $isMaximizing, Player $aiPlayer): int|float
    {
        $winner = $this->rules->checkWinner($board);
        if ($winner !== null) {
            return $winner->player === $aiPlayer
                ? 10 - $depth
                : $depth - 10;
        }

        if ($board->isFull()) {
            return 0;
        }

        $opponent = $aiPlayer->opponent();
        $available = $board->availableIndices();

        if ($isMaximizing) {
            $maxScore = -INF;
            foreach ($available as $move) {
                $score = $this->minimax($board->withMove($move, $aiPlayer), $depth + 1, false, $aiPlayer);
                $maxScore = max($maxScore, $score);
            }

            return $maxScore;
        }

        $minScore = INF;
        foreach ($available as $move) {
            $score = $this->minimax($board->withMove($move, $opponent), $depth + 1, true, $aiPlayer);
            $minScore = min($minScore, $score);
        }

        return $minScore;
    }
}
