<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GameBroadcastTest extends TestCase
{
    private const TEST_API_KEY = 'test-centrifugo-api-key';

    private const TEST_HMAC_SECRET = 'test-centrifugo-hmac-secret-32-bytes';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'centrifugo.internal_url' => 'http://centrifugo:8080',
            'centrifugo.api_key' => self::TEST_API_KEY,
            'centrifugo.hmac_secret' => self::TEST_HMAC_SECRET,
            'centrifugo.token_ttl' => 3600,
        ]);
    }

    public function test_connection_token_endpoint_returns_valid_hs256_jwt(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_conn_1',
        ])->postJson('/api/centrifugo/connection-token');

        $response->assertOk();
        $response->assertJson(['client_id' => 'client_conn_1']);

        $payload = $this->decodeAndVerifyJwt((string) $response->json('token'));
        $this->assertSame('client_conn_1', $payload['sub']);
        $this->assertGreaterThan(time(), $payload['exp']);
    }

    public function test_events_endpoint_publishes_sudoku_cell_update_to_centrifugo_api(): void
    {
        Http::fake([
            'http://centrifugo:8080/api/publish' => Http::response(['result' => []], 200),
        ]);

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

        Http::assertSent(function (HttpClientRequest $request): bool {
            return $request->url() === 'http://centrifugo:8080/api/publish'
                && $request->hasHeader('X-API-Key', self::TEST_API_KEY)
                && $request['channel'] === 'sudoku:game.room-xyz'
                && $request['data']['type'] === 'cell-update'
                && $request['data']['data'] === ['index' => 40, 'value' => 7, 'notes' => []];
        });
    }

    public function test_games_subscription_token_authorization_and_jwt_claims(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_abc',
            'X-Player-Role' => 'host',
            'X-Game-Mode' => 'solo',
        ])->postJson('/api/centrifugo/subscription-token', [
            'channel' => 'sudoku:game.test-room',
        ]);

        $response->assertOk();

        $payload = $this->decodeAndVerifyJwt((string) $response->json('token'));
        $this->assertSame('client_abc', $payload['sub']);
        $this->assertSame('sudoku:game.test-room', $payload['channel']);
        $this->assertSame('client_abc', $payload['info']['id']);
        $this->assertSame('host', $payload['info']['role']);
        $this->assertSame('solo', $payload['info']['game_mode']);
    }

    public function test_lobby_subscription_token_authorization(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_host_1',
            'X-Game-Id' => 'room-456',
            'X-Status' => 'waiting',
            'X-Game-Mode' => 'solo',
            'X-Difficulty' => 'hard',
            'X-Filled-Count' => '27',
        ])->postJson('/api/centrifugo/subscription-token', [
            'channel' => 'sudoku:lobby',
        ]);

        $response->assertOk();

        $payload = $this->decodeAndVerifyJwt((string) $response->json('token'));
        $this->assertSame('client_host_1', $payload['sub']);
        $this->assertSame('sudoku:lobby', $payload['channel']);
        $this->assertSame('client_host_1', $payload['info']['id']);
        $this->assertSame('room-456', $payload['info']['game_id']);
        $this->assertSame('waiting', $payload['info']['status']);
        $this->assertSame('solo', $payload['info']['game_mode']);
        $this->assertSame('hard', $payload['info']['difficulty']);
        $this->assertSame(27, $payload['info']['filled_count']);
    }

    public function test_subscription_token_rejects_unauthorized_or_malformed_channels(): void
    {
        $this->postJson('/api/centrifugo/subscription-token', [
            'channel' => 'admin:secrets',
        ])->assertForbidden();

        $this->postJson('/api/centrifugo/subscription-token', [
            'channel' => 'sudoku:game.x',
        ])->assertForbidden();
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

    public function test_games_subscription_token_sanitizes_invalid_client_and_role(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'invalid client id <script>',
            'X-Player-Role' => 'admin',
            'X-Game-Mode' => 'hacked',
        ])->postJson('/api/centrifugo/subscription-token', [
            'channel' => 'sudoku:game.test-room',
        ]);

        $response->assertOk();
        $payload = $this->decodeAndVerifyJwt((string) $response->json('token'));

        $this->assertMatchesRegularExpression('/^client_[a-f0-9]{12}$/', $payload['sub']);
        $this->assertSame($payload['sub'], $payload['info']['id']);
        $this->assertSame('spectator', $payload['info']['role']);
        $this->assertSame('online', $payload['info']['game_mode']);
    }

    public function test_lobby_subscription_token_sanitizes_malicious_game_id_and_clamps_filled_count(): void
    {
        $response = $this->withHeaders([
            'X-Client-Id' => 'client_xss_test',
            'X-Game-Id' => '"><script>alert(1)</script>',
            'X-Status' => 'bogus',
            'X-Game-Mode' => 'invalid',
            'X-Difficulty' => 'impossible',
            'X-Filled-Count' => '999',
        ])->postJson('/api/centrifugo/subscription-token', [
            'channel' => 'sudoku:lobby',
        ]);

        $response->assertOk();
        $payload = $this->decodeAndVerifyJwt((string) $response->json('token'));

        $this->assertNull($payload['info']['game_id']);
        $this->assertSame('waiting', $payload['info']['status']);
        $this->assertSame('online', $payload['info']['game_mode']);
        $this->assertSame('medium', $payload['info']['difficulty']);
        $this->assertSame(81, $payload['info']['filled_count']);
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeAndVerifyJwt(string $token): array
    {
        $parts = explode('.', $token);
        $this->assertCount(3, $parts);

        [$headerSegment, $payloadSegment, $signatureSegment] = $parts;

        $expectedSig = rtrim(strtr(base64_encode(
            hash_hmac('sha256', "{$headerSegment}.{$payloadSegment}", self::TEST_HMAC_SECRET, true)
        ), '+/', '-_'), '=');

        $this->assertTrue(hash_equals($expectedSig, $signatureSegment), 'JWT HMAC-SHA256 signature mismatch.');

        $header = json_decode((string) base64_decode(strtr($headerSegment, '-_', '+/')), true);
        $this->assertSame('HS256', $header['alg'] ?? null);

        $payload = json_decode((string) base64_decode(strtr($payloadSegment, '-_', '+/')), true);
        $this->assertIsArray($payload);

        return $payload;
    }
}
