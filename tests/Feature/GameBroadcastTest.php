<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Events\GameBroadcastEvent;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

final class GameBroadcastTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => '123456',
        ]);

        require base_path('routes/channels.php');
    }

    public function test_events_endpoint_dispatches_game_broadcast_event(): void
    {
        Event::fake([GameBroadcastEvent::class]);

        $response = $this->postJson('/api/games/room-xyz/events', [
            'type' => 'move',
            'data' => [
                'index' => 4,
                'symbol' => 'X',
            ],
        ]);

        $response->assertOk();
        $response->assertJson(['ok' => true]);

        Event::assertDispatched(GameBroadcastEvent::class, function (GameBroadcastEvent $event) {
            return $event->gameId === 'room-xyz'
                && $event->type === 'move'
                && $event->data === ['index' => 4, 'symbol' => 'X'];
        });
    }

    public function test_games_presence_channel_authorization(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_abc',
            'X-Player-Role' => 'host',
            'X-Player-Symbol' => 'X',
        ])->post('/broadcasting/auth', [
            'channel_name' => 'presence-games.test-room',
            'socket_id' => '1234.5678',
        ]);

        $response->assertOk();
        $data = $response->json();
        $this->assertArrayHasKey('channel_data', $data);

        $channelData = json_decode($data['channel_data'], true);
        $this->assertSame('client_abc', $channelData['user_id']);
        $this->assertSame('host', $channelData['user_info']['role']);
        $this->assertSame('X', $channelData['user_info']['symbol']);
    }

    public function test_lobby_presence_channel_authorization(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_host_1',
            'X-Game-Id' => 'room-456',
            'X-Status' => 'waiting',
            'X-Moves-Count' => '0',
        ])->post('/broadcasting/auth', [
            'channel_name' => 'presence-lobby',
            'socket_id' => '1234.5678',
        ]);

        $response->assertOk();
        $data = $response->json();
        $this->assertArrayHasKey('channel_data', $data);

        $channelData = json_decode($data['channel_data'], true);
        $this->assertSame('client_host_1', $channelData['user_id']);
        $this->assertSame('room-456', $channelData['user_info']['game_id']);
        $this->assertSame('waiting', $channelData['user_info']['status']);
        $this->assertSame(0, $channelData['user_info']['moves_count']);
    }
}
