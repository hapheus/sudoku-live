<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

enum AiDifficulty: string
{
    case Easy = 'easy';
    case Medium = 'medium';
    case Hard = 'hard';
}
