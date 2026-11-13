<?php

declare(strict_types=1);

use App\Models\Game;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('games.{gameId}', function ($user, string $gameId): bool {
    $token = $user?->token ?? request()->header('X-Participant-Token');

    if (! is_string($token) || $token === '') {
        return false;
    }

    $game = Game::find($gameId);
    if (! $game) {
        return false;
    }

    return $game->resolveRole($token) !== null;
}, ['guards' => ['participant']]);
