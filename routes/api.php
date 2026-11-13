<?php

declare(strict_types=1);

use App\Http\Controllers\Api\GameController;
use Illuminate\Support\Facades\Route;

Route::prefix('games')->group(function (): void {
    Route::get('live', [GameController::class, 'live'])->name('api.games.live');
    Route::post('/', [GameController::class, 'store'])->name('api.games.store');
    Route::get('{game}', [GameController::class, 'show'])->name('api.games.show');
    Route::post('{game}/join', [GameController::class, 'join'])->name('api.games.join');
    Route::post('{game}/moves', [GameController::class, 'makeMove'])->name('api.games.moves');
    Route::post('{game}/rematch', [GameController::class, 'rematch'])->name('api.games.rematch');
});
