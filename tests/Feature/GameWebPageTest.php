<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class GameWebPageTest extends TestCase
{
    public function test_home_page_renders_game_board_and_mode_tabs(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('Tic', false);
        $response->assertSee('Tac', false);
        $response->assertSee('Toe', false);
        $response->assertSee('role="grid"', false);
        $response->assertSee('data-mode-btn="local"', false);
        $response->assertSee('data-mode-btn="computer"', false);
        $response->assertSee('data-mode-btn="online"', false);
        $response->assertSee('data-mode-btn="watch"', false);
        $response->assertSee('id="game-announcements"', false);
    }

    public function test_multiplayer_game_page_renders_without_database(): void
    {
        $response = $this->get('/games/test-room-456');

        $response->assertOk();
        $response->assertSee('test-room-456');
        $response->assertSee('data-initial-mode="online"', false);
    }
}
