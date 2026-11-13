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

    public function test_events_endpoint_dispatches_sudoku_cell_update_event(): void
    {
        Event::fake([GameBroadcastEvent::class]);

        $response = $this->postJson('/api/games/room-xyz/events', [
            'type' => 'cell-update',
            'data' => [
                'index' => 40,
                'value' => 7,
                'notes' => [],
            ],
        ]);

        $response->assertOk();
        $response->assertJson(['ok' => true]);

        Event::assertDispatched(GameBroadcastEvent::class, function (GameBroadcastEvent $event) {
            return $event->gameId === 'room-xyz'
                && $event->type === 'cell-update'
                && $event->data === ['index' => 40, 'value' => 7, 'notes' => []];
        });
    }

    public function test_games_presence_channel_authorization(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_abc',
            'X-Player-Role' => 'host',
            'X-Game-Mode' => 'solo',
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
        $this->assertSame('solo', $channelData['user_info']['game_mode']);
    }

    public function test_lobby_presence_channel_authorization(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_host_1',
            'X-Game-Id' => 'room-456',
            'X-Status' => 'waiting',
            'X-Game-Mode' => 'solo',
            'X-Difficulty' => 'hard',
            'X-Filled-Count' => '27',
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
        $this->assertSame('solo', $channelData['user_info']['game_mode']);
        $this->assertSame('hard', $channelData['user_info']['difficulty']);
        $this->assertSame(27, $channelData['user_info']['filled_count']);
    }

    public function test_events_endpoint_rejects_invalid_type_and_cell_payload(): void
    {
        $invalidType = $this->postJson('/api/games/room-xyz/events', [
            'type' => 'arbitrary-evil-event',
            'data' => [],
        ]);
        $invalidType->assertUnprocessable();

        $invalidCell = $this->postJson('/api/games/room-xyz/events', [
            'type' => 'cell-update',
            'data' => ['index' => 99, 'value' => 12],
        ]);
        $invalidCell->assertUnprocessable();

        $invalidRoom = $this->postJson('/api/games/x/events', [
            'type' => 'sync',
            'data' => [],
        ]);
        $invalidRoom->assertNotFound();
    }

    public function test_games_presence_channel_sanitizes_invalid_client_and_role(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'invalid client id <script>',
            'X-Player-Role' => 'admin',
            'X-Game-Mode' => 'hacked',
        ])->post('/broadcasting/auth', [
            'channel_name' => 'presence-games.test-room',
            'socket_id' => '1234.5678',
        ]);

        $response->assertOk();
        $channelData = json_decode($response->json('channel_data'), true);

        $this->assertMatchesRegularExpression('/^client_[a-f0-9]{12}$/', $channelData['user_id']);
        $this->assertSame('spectator', $channelData['user_info']['role']);
        $this->assertSame('online', $channelData['user_info']['game_mode']);
    }

    public function test_lobby_presence_channel_sanitizes_malicious_game_id_and_clamps_filled_count(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_xss_test',
            'X-Game-Id' => '"><script>alert(1)</script>',
            'X-Status' => 'bogus',
            'X-Game-Mode' => 'invalid',
            'X-Difficulty' => 'impossible',
            'X-Filled-Count' => '999',
        ])->post('/broadcasting/auth', [
            'channel_name' => 'presence-lobby',
            'socket_id' => '1234.5678',
        ]);

        $response->assertOk();
        $channelData = json_decode($response->json('channel_data'), true);

        $this->assertNull($channelData['user_info']['game_id']);
        $this->assertSame('waiting', $channelData['user_info']['status']);
        $this->assertSame('online', $channelData['user_info']['game_mode']);
        $this->assertSame('medium', $channelData['user_info']['difficulty']);
        $this->assertSame(81, $channelData['user_info']['filled_count']);
    }
}
