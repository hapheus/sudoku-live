<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('games.{gameId}', function ($user, string $gameId): array|false {
    if (preg_match('/^[A-Za-z0-9_-]{6,64}$/', $gameId) !== 1) {
        return false;
    }

    $rawRole = request()->header('X-Player-Role') ?? request('role', 'spectator');
    $role = in_array($rawRole, ['host', 'guest', 'spectator'], true) ? $rawRole : 'spectator';

    $rawMode = request()->header('X-Game-Mode') ?? request('game_mode', 'online');
    $gameMode = in_array($rawMode, ['solo', 'online'], true) ? $rawMode : 'online';

    return [
        'id' => (string) $user->getAuthIdentifier(),
        'role' => $role,
        'game_mode' => $gameMode,
    ];
}, ['guards' => ['participant']]);

Broadcast::channel('lobby', function ($user): array {
    $rawGameId = request()->header('X-Game-Id') ?? request('game_id');
    $gameId = is_string($rawGameId) && preg_match('/^[A-Za-z0-9_-]{6,64}$/', $rawGameId) === 1
        ? $rawGameId
        : null;

    $rawStatus = request()->header('X-Status') ?? request('status', 'waiting');
    $status = in_array($rawStatus, ['waiting', 'in_progress', 'solved', 'finished'], true) ? $rawStatus : 'waiting';

    $rawMode = request()->header('X-Game-Mode') ?? request('game_mode', 'online');
    $gameMode = in_array($rawMode, ['solo', 'online'], true) ? $rawMode : 'online';

    $rawDifficulty = request()->header('X-Difficulty') ?? request('difficulty', 'medium');
    $difficulty = in_array($rawDifficulty, ['easy', 'medium', 'hard', 'expert'], true) ? $rawDifficulty : 'medium';

    $rawFilled = (int) (request()->header('X-Filled-Count') ?? request('filled_count', 0));
    $filledCount = max(0, min(81, $rawFilled));

    return [
        'id' => (string) $user->getAuthIdentifier(),
        'game_id' => $gameId,
        'status' => $status,
        'game_mode' => $gameMode,
        'difficulty' => $difficulty,
        'filled_count' => $filledCount,
        'created_at' => now()->toIso8601String(),
    ];
}, ['guards' => ['participant']]);
