<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class LiveGamesTest extends TestCase
{
    use RefreshDatabase;

    public function test_lists_waiting_and_in_progress_games(): void
    {
        // 1. Waiting game
        $waitingGame = Game::createNew('token-1');

        // 2. In progress game
        $inProgressGame = Game::createNew('token-2');
        $inProgressGame->guest_token_hash = hash('sha256', 'guest-token');
        $inProgressGame->status = 'in_progress';
        $inProgressGame->save();

        // 3. Finished game (won) - should not appear in live list
        $finishedGame = Game::createNew('token-3');
        $finishedGame->status = 'won';
        $finishedGame->winner = 'X';
        $finishedGame->save();

        $response = $this->getJson('/api/games/live');

        $response->assertOk();
        $response->assertJsonStructure([
            'games' => [
                '*' => [
                    'id',
                    'status',
                    'current_turn',
                    'move_count',
                    'has_guest',
                    'created_at',
                    'updated_at',
                ],
            ],
            'count',
        ]);

        $ids = collect($response->json('games'))->pluck('id')->all();
        $this->assertContains($waitingGame->id, $ids);
        $this->assertContains($inProgressGame->id, $ids);
        $this->assertNotContains($finishedGame->id, $ids);
    }

    public function test_empty_list_when_no_active_games(): void
    {
        $response = $this->getJson('/api/games/live');

        $response->assertOk();
        $response->assertJson([
            'games' => [],
            'count' => 0,
        ]);
    }
}
