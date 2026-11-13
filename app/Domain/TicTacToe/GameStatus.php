<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

enum GameStatus: string
{
    case InProgress = 'in_progress';
    case Won = 'won';
    case Draw = 'draw';

    public function isFinished(): bool
    {
        return $this !== self::InProgress;
    }
}
