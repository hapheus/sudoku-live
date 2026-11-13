<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

enum Player: string
{
    case X = 'X';
    case O = 'O';

    public function opponent(): self
    {
        return $this === self::X ? self::O : self::X;
    }
}
