<?php

declare(strict_types=1);

use App\Models\Game;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('game', ['mode' => 'local']);
})->name('home');

Route::get('/games/{game}', function (string $game) {
    // Verify game exists or return 404
    Game::findOrFail($game);

    return view('game', [
        'mode' => 'online',
        'gameId' => $game,
    ]);
})->name('games.show');
