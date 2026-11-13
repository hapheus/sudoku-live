<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class WebRouteTest extends TestCase
{
    public function test_homepage_loads_successfully(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('Sudoku');
        $response->assertSee('Solo');
        $response->assertSee('Online Co-op');
        $response->assertSee('Watch Live');
    }

    public function test_game_room_route_loads_without_database(): void
    {
        $gameId = 'test-room-123';
        $response = $this->get("/games/{$gameId}");

        $response->assertOk();
        $response->assertSee("data-game-id=\"{$gameId}\"", false);
        $response->assertSee('data-initial-mode="online"', false);
    }

    public function test_invalid_game_room_id_returns_404(): void
    {
        $this->get('/games/x')->assertNotFound();
    }
}
