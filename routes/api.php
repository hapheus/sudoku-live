<?php

declare(strict_types=1);

use App\Events\GameBroadcastEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/games/{gameId}/events', function (Request $request, string $gameId): JsonResponse {
    $type = (string) $request->input('type', 'state');
    $data = (array) $request->input('data', []);

    broadcast(new GameBroadcastEvent($gameId, $type, $data))->toOthers();

    return response()->json(['ok' => true]);
});
