<?php

declare(strict_types=1);

use App\Services\CentrifugoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/centrifugo/connection-token', function (Request $request): JsonResponse {
    $centrifugo = CentrifugoService::fromConfig();

    $rawClientId = $request->header('X-Client-Id') ?? $request->input('client_id');
    $clientId = $centrifugo->resolveClientId(is_string($rawClientId) ? $rawClientId : null);

    return response()->json([
        'client_id' => $clientId,
        'token' => $centrifugo->generateConnectionToken($clientId),
    ]);
})->middleware('throttle:game-events');

Route::post('/centrifugo/subscription-token', function (Request $request): JsonResponse {
    $validated = $request->validate([
        'channel' => ['required', 'string', 'max:128'],
    ]);

    $channel = $validated['channel'];
    $centrifugo = CentrifugoService::fromConfig();

    $rawClientId = $request->header('X-Client-Id') ?? $request->input('client_id');
    $clientId = $centrifugo->resolveClientId(is_string($rawClientId) ? $rawClientId : null);

    if (preg_match('/^sudoku:game\.([A-Za-z0-9_-]{6,64})$/', $channel) === 1) {
        $rawRole = $request->header('X-Player-Role') ?? $request->input('role', 'spectator');
        $role = in_array($rawRole, ['host', 'guest', 'spectator'], true) ? $rawRole : 'spectator';

        $rawMode = $request->header('X-Game-Mode') ?? $request->input('game_mode', 'online');
        $gameMode = in_array($rawMode, ['solo', 'online'], true) ? $rawMode : 'online';

        return response()->json([
            'token' => $centrifugo->generateSubscriptionToken($clientId, $channel, [
                'id' => $clientId,
                'role' => $role,
                'game_mode' => $gameMode,
            ]),
        ]);
    }

    if ($channel === 'sudoku:lobby') {
        $rawGameId = $request->header('X-Game-Id') ?? $request->input('game_id');
        $gameId = is_string($rawGameId) && preg_match('/^[A-Za-z0-9_-]{6,64}$/', $rawGameId) === 1
            ? $rawGameId
            : null;

        $rawStatus = $request->header('X-Status') ?? $request->input('status', 'waiting');
        $status = in_array($rawStatus, ['waiting', 'in_progress', 'solved', 'finished'], true) ? $rawStatus : 'waiting';

        $rawMode = $request->header('X-Game-Mode') ?? $request->input('game_mode', 'online');
        $gameMode = in_array($rawMode, ['solo', 'online'], true) ? $rawMode : 'online';

        $rawDifficulty = $request->header('X-Difficulty') ?? $request->input('difficulty', 'medium');
        $difficulty = in_array($rawDifficulty, ['easy', 'medium', 'hard', 'expert'], true) ? $rawDifficulty : 'medium';

        $rawFilled = (int) ($request->header('X-Filled-Count') ?? $request->input('filled_count', 0));
        $filledCount = max(0, min(81, $rawFilled));

        return response()->json([
            'token' => $centrifugo->generateSubscriptionToken($clientId, $channel, [
                'id' => $clientId,
                'game_id' => $gameId,
                'status' => $status,
                'game_mode' => $gameMode,
                'difficulty' => $difficulty,
                'filled_count' => $filledCount,
                'created_at' => now()->toIso8601String(),
            ]),
        ]);
    }

    return response()->json(['message' => 'Forbidden channel.'], 403);
})->middleware('throttle:game-events');

Route::post('/games/{gameId}/events', function (Request $request, string $gameId): JsonResponse {
    $rules = [
        'type' => ['required', 'string', 'in:init,sync,cell-update,new-puzzle-request,new-puzzle-accept'],
        'data' => ['sometimes', 'array'],
        'data.eventId' => ['sometimes', 'string', 'max:64'],
    ];

    if ($request->input('type') === 'cell-update') {
        $rules['data'] = ['required', 'array'];
        $rules['data.index'] = ['required', 'integer', 'between:0,80'];
        $rules['data.value'] = ['nullable', 'integer', 'between:0,9'];
        $rules['data.notes'] = ['sometimes', 'array', 'max:9'];
        $rules['data.notes.*'] = ['integer', 'between:1,9'];
    } elseif ($request->input('type') === 'new-puzzle-request') {
        $rules['data'] = ['required', 'array'];
        $rules['data.role'] = ['required', 'string', 'in:host,guest'];
    }

    $validated = $request->validate($rules);

    $published = CentrifugoService::fromConfig()->publish("sudoku:game.{$gameId}", [
        'type' => $validated['type'],
        'data' => $validated['data'] ?? [],
    ]);

    return response()->json(['ok' => $published], $published ? 200 : 502);
})
    ->where('gameId', '[A-Za-z0-9_-]{6,64}')
    ->middleware('throttle:game-events');
