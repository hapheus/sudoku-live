<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

final readonly class WinningLine
{
    /**
     * @param  array<int, int>  $indices  Exactly 3 board cell indices (0-8)
     */
    public function __construct(
        public Player $player,
        public array $indices,
    ) {}
}
