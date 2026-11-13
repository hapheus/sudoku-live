<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('game', ['mode' => 'local']);
})->name('home');

Route::get('/games/{game}', function (string $game) {
    return view('game', [
        'mode' => 'online',
        'gameId' => $game,
    ]);
})->name('games.show');
