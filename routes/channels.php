<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('games.{gameId}', function ($user, string $gameId): array {
    $role = request()->header('X-Player-Role') ?? request('role', 'spectator');
    $symbol = request()->header('X-Player-Symbol') ?? request('symbol');

    return [
        'id' => (string) $user->getAuthIdentifier(),
        'role' => $role,
        'symbol' => $symbol,
    ];
}, ['guards' => ['participant']]);

Broadcast::channel('lobby', function ($user): array {
    return [
        'id' => (string) $user->getAuthIdentifier(),
        'game_id' => request()->header('X-Game-Id') ?? request('game_id'),
        'status' => request()->header('X-Status') ?? request('status', 'waiting'),
        'moves_count' => (int) (request()->header('X-Moves-Count') ?? request('moves_count', 0)),
        'created_at' => now()->toIso8601String(),
    ];
}, ['guards' => ['participant']]);
