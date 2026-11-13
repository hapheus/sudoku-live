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
        $response->assertSee('Tic');
        $response->assertSee('Local 2P');
        $response->assertSee('vs AI');
        $response->assertSee('Online');
        $response->assertSee('Watch');
    }

    public function test_game_room_route_loads_without_database(): void
    {
        $gameId = 'test-room-123';
        $response = $this->get("/games/{$gameId}");

        $response->assertOk();
        $response->assertSee("data-game-id=\"{$gameId}\"", false);
        $response->assertSee('data-initial-mode="online"', false);
    }
}
