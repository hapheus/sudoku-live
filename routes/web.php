<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('game', ['mode' => 'solo']);
})->name('home');

Route::get('/games/{game}', function (string $game) {
    return view('game', [
        'mode' => 'online',
        'gameId' => $game,
    ]);
})
    ->where('game', '[A-Za-z0-9_-]{6,64}')
    ->name('games.show');
