<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

final readonly class GameParticipant
{
    public function __construct(
        public string $gameId,
        public string $role,
        public Player $player,
        public string $token,
    ) {}
}
