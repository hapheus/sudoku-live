<?php

declare(strict_types=1);

use App\Events\GameBroadcastEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

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

    broadcast(new GameBroadcastEvent(
        $gameId,
        $validated['type'],
        $validated['data'] ?? [],
    ))->toOthers();

    return response()->json(['ok' => true]);
})
    ->where('gameId', '[A-Za-z0-9_-]{6,64}')
    ->middleware('throttle:game-events');
