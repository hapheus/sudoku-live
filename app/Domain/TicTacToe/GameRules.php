<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

final readonly class GameRules
{
    /**
     * @var list<array{0: int, 1: int, 2: int}>
     */
    public const array WINNING_COMBINATIONS = [
        // Horizontal rows
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        // Vertical columns
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        // Diagonals
        [0, 4, 8],
        [2, 4, 6],
    ];

    public function checkWinner(Board $board): ?WinningLine
    {
        foreach (self::WINNING_COMBINATIONS as $combination) {
            [$a, $b, $c] = $combination;
            $playerA = $board->getCell($a);

            if ($playerA !== null &&
                $playerA === $board->getCell($b) &&
                $playerA === $board->getCell($c)
            ) {
                return new WinningLine($playerA, $combination);
            }
        }

        return null;
    }

    public function isDraw(Board $board): bool
    {
        return $this->checkWinner($board) === null && $board->isFull();
    }

    public function determineStatus(Board $board): GameStatus
    {
        if ($this->checkWinner($board) !== null) {
            return GameStatus::Won;
        }

        if ($board->isFull()) {
            return GameStatus::Draw;
        }

        return GameStatus::InProgress;
    }
}
