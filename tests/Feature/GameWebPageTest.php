<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class GameWebPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_page_renders_game_board_and_mode_tabs(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('Tic Tac Toe', false);
        $response->assertSee('role="grid"', false);
        $response->assertSee('data-mode-btn="local"', false);
        $response->assertSee('data-mode-btn="computer"', false);
        $response->assertSee('data-mode-btn="online"', false);
        $response->assertSee('id="game-announcements"', false);
    }

    public function test_multiplayer_game_page_renders_for_existing_game(): void
    {
        $game = Game::createNew('test-token');

        $response = $this->get("/games/{$game->id}");

        $response->assertOk();
        $response->assertSee($game->id);
        $response->assertSee('data-initial-mode="online"', false);
    }

    public function test_multiplayer_game_page_returns_404_for_unknown_game(): void
    {
        $response = $this->get('/games/non-existent-uuid');

        $response->assertNotFound();
    }
}
