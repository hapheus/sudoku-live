<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class GameWebPageTest extends TestCase
{
    public function test_home_page_renders_sudoku_board_and_mode_tabs(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('Sudoku', false);
        $response->assertSee('id="sudoku-board"', false);
        $response->assertSee('data-mode-btn="solo"', false);
        $response->assertSee('data-mode-btn="online"', false);
        $response->assertSee('data-mode-btn="watch"', false);
        $response->assertSee('id="game-announcements"', false);
        $response->assertSee('name="sudoku-difficulty"', false);
    }

    public function test_multiplayer_game_page_renders_without_database(): void
    {
        $response = $this->get('/games/test-room-456');

        $response->assertOk();
        $response->assertSee('test-room-456');
        $response->assertSee('data-initial-mode="online"', false);
    }

    public function test_page_uses_split_horizon_public_centrifugo_options_for_browser_client(): void
    {
        config([
            'centrifugo.internal_url' => 'http://centrifugo:8080',
            'centrifugo.public_host' => 'sudoku-ws.example.com',
            'centrifugo.public_port' => 443,
            'centrifugo.public_scheme' => 'https',
        ]);

        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('data-ws-host="sudoku-ws.example.com"', false);
        $response->assertSee('data-ws-port="443"', false);
        $response->assertSee('data-ws-scheme="https"', false);
    }

    public function test_trusted_proxies_honor_cloudflare_https_headers(): void
    {
        $response = $this->withHeaders([
            'X-Forwarded-Proto' => 'https',
            'X-Forwarded-Host' => 'sudoku.example.com',
            'X-Forwarded-Port' => '443',
        ])->get('/up');

        $response->assertOk();
    }
}
