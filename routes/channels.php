<?php

declare(strict_types=1);

use App\Models\Game;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('games.{gameId}', function ($user, string $gameId): array|false {
    $game = Game::find($gameId);
    if (! $game) {
        return false;
    }

    $token = $user?->token ?? request()->header('X-Participant-Token');
    $role = is_string($token) ? $game->resolveRole($token) : null;

    if ($role !== null) {
        return [
            'id' => (string) $user->getAuthIdentifier(),
            'role' => $role,
            'symbol' => $role === 'host' ? $game->host_symbol : $game->guest_symbol,
        ];
    }

    // Spectator
    return [
        'id' => (string) $user->getAuthIdentifier(),
        'role' => 'spectator',
        'symbol' => null,
    ];
}, ['guards' => ['participant']]);
