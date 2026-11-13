<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Events\GameUpdated;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

final class MultiplayerGameTest extends TestCase
{
    use RefreshDatabase;

    public function test_player_can_create_a_game(): void
    {
        Event::fake([GameUpdated::class]);

        $response = $this->postJson('/api/games');

        $response->assertCreated();
        $response->assertJsonStructure([
            'game_id',
            'participant_token',
            'role',
            'symbol',
            'invite_url',
            'state' => [
                'id',
                'status',
                'board',
                'current_turn',
                'version',
                'has_guest',
            ],
        ]);

        $data = $response->json();
        $this->assertSame('host', $data['role']);
        $this->assertSame('X', $data['symbol']);
        $this->assertSame('waiting', $data['state']['status']);
        $this->assertFalse($data['state']['has_guest']);
        $this->assertDatabaseHas('games', [
            'id' => $data['game_id'],
            'status' => 'waiting',
        ]);
    }

    public function test_second_player_can_join_game(): void
    {
        Event::fake([GameUpdated::class]);

        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');

        $joinResponse = $this->postJson("/api/games/{$gameId}/join");

        $joinResponse->assertOk();
        $joinResponse->assertJsonStructure([
            'game_id',
            'participant_token',
            'role',
            'symbol',
            'state' => [
                'status',
                'has_guest',
                'version',
            ],
        ]);

        $joinData = $joinResponse->json();
        $this->assertSame('guest', $joinData['role']);
        $this->assertSame('O', $joinData['symbol']);
        $this->assertSame('in_progress', $joinData['state']['status']);
        $this->assertTrue($joinData['state']['has_guest']);

        Event::assertDispatched(GameUpdated::class, function (GameUpdated $event) use ($gameId) {
            return $event->gameId === $gameId && $event->state['status'] === 'in_progress';
        });
    }

    public function test_third_player_cannot_join_full_game(): void
    {
        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');

        $this->postJson("/api/games/{$gameId}/join")->assertOk();

        // 3rd player attempts to join
        $thirdResponse = $this->postJson("/api/games/{$gameId}/join");
        $thirdResponse->assertStatus(409);
        $thirdResponse->assertJson(['message' => 'Game is already full.']);
    }

    public function test_host_can_make_opening_move(): void
    {
        Event::fake([GameUpdated::class]);

        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');
        $hostToken = $createResponse->json('participant_token');

        // Guest joins to make it in_progress
        $joinResponse = $this->postJson("/api/games/{$gameId}/join");
        $version = $joinResponse->json('state.version');

        $moveResponse = $this->withHeader('X-Participant-Token', $hostToken)
            ->postJson("/api/games/{$gameId}/moves", [
                'index' => 4, // Center
                'expected_version' => $version,
            ]);

        $moveResponse->assertOk();
        $data = $moveResponse->json('state');
        $this->assertSame('X', $data['board'][4]);
        $this->assertSame('O', $data['current_turn']);
        $this->assertSame($version + 1, $data['version']);

        Event::assertDispatched(GameUpdated::class, function (GameUpdated $event) use ($gameId) {
            return $event->gameId === $gameId && $event->state['board'][4] === 'X';
        });
    }

    public function test_out_of_turn_move_is_rejected(): void
    {
        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');

        $joinResponse = $this->postJson("/api/games/{$gameId}/join");
        $guestToken = $joinResponse->json('participant_token');
        $version = $joinResponse->json('state.version');

        // Guest attempts to move first (it is X's turn)
        $moveResponse = $this->withHeader('X-Participant-Token', $guestToken)
            ->postJson("/api/games/{$gameId}/moves", [
                'index' => 4,
                'expected_version' => $version,
            ]);

        $moveResponse->assertStatus(422);
        $moveResponse->assertJson(['message' => 'It is not your turn.']);
    }

    public function test_move_on_occupied_cell_is_rejected(): void
    {
        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');
        $hostToken = $createResponse->json('participant_token');

        $joinResponse = $this->postJson("/api/games/{$gameId}/join");
        $guestToken = $joinResponse->json('participant_token');
        $version = $joinResponse->json('state.version');

        // Host plays cell 4
        $this->withHeader('X-Participant-Token', $hostToken)
            ->postJson("/api/games/{$gameId}/moves", [
                'index' => 4,
                'expected_version' => $version,
            ])->assertOk();

        // Guest attempts to play cell 4 as well
        $response = $this->withHeader('X-Participant-Token', $guestToken)
            ->postJson("/api/games/{$gameId}/moves", [
                'index' => 4,
                'expected_version' => $version + 1,
            ]);

        $response->assertStatus(422);
    }

    public function test_move_with_stale_expected_version_is_rejected_due_to_conflict(): void
    {
        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');
        $hostToken = $createResponse->json('participant_token');

        $this->postJson("/api/games/{$gameId}/join");

        // Stale version: passing 99 instead of current version
        $response = $this->withHeader('X-Participant-Token', $hostToken)
            ->postJson("/api/games/{$gameId}/moves", [
                'index' => 4,
                'expected_version' => 99,
            ]);

        $response->assertStatus(409);
        $response->assertJson(['message' => 'Game state conflict. Please refresh.']);
    }

    public function test_game_can_be_won_and_prevents_subsequent_moves(): void
    {
        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');
        $hostToken = $createResponse->json('participant_token');

        $joinResponse = $this->postJson("/api/games/{$gameId}/join");
        $guestToken = $joinResponse->json('participant_token');
        $v = $joinResponse->json('state.version');

        // Sequence for X horizontal win on row 0:
        // X: 0, O: 3
        // X: 1, O: 4
        // X: 2 (wins!)
        $this->withHeader('X-Participant-Token', $hostToken)
            ->postJson("/api/games/{$gameId}/moves", ['index' => 0, 'expected_version' => $v++])->assertOk();
        $this->withHeader('X-Participant-Token', $guestToken)
            ->postJson("/api/games/{$gameId}/moves", ['index' => 3, 'expected_version' => $v++])->assertOk();
        $this->withHeader('X-Participant-Token', $hostToken)
            ->postJson("/api/games/{$gameId}/moves", ['index' => 1, 'expected_version' => $v++])->assertOk();
        $this->withHeader('X-Participant-Token', $guestToken)
            ->postJson("/api/games/{$gameId}/moves", ['index' => 4, 'expected_version' => $v++])->assertOk();

        $winResponse = $this->withHeader('X-Participant-Token', $hostToken)
            ->postJson("/api/games/{$gameId}/moves", ['index' => 2, 'expected_version' => $v++]);

        $winResponse->assertOk();
        $state = $winResponse->json('state');
        $this->assertSame('won', $state['status']);
        $this->assertSame('X', $state['winner']);
        $this->assertSame([0, 1, 2], $state['winning_indices']);

        // Subsequent move must be rejected
        $postWinMove = $this->withHeader('X-Participant-Token', $guestToken)
            ->postJson("/api/games/{$gameId}/moves", ['index' => 8, 'expected_version' => $v]);
        $postWinMove->assertStatus(422);
    }

    public function test_rematch_requires_mutual_agreement(): void
    {
        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');
        $hostToken = $createResponse->json('participant_token');

        $joinResponse = $this->postJson("/api/games/{$gameId}/join");
        $guestToken = $joinResponse->json('participant_token');
        $v = $joinResponse->json('state.version');

        // Win the game quickly
        $this->withHeader('X-Participant-Token', $hostToken)->postJson("/api/games/{$gameId}/moves", ['index' => 0, 'expected_version' => $v++]);
        $this->withHeader('X-Participant-Token', $guestToken)->postJson("/api/games/{$gameId}/moves", ['index' => 3, 'expected_version' => $v++]);
        $this->withHeader('X-Participant-Token', $hostToken)->postJson("/api/games/{$gameId}/moves", ['index' => 1, 'expected_version' => $v++]);
        $this->withHeader('X-Participant-Token', $guestToken)->postJson("/api/games/{$gameId}/moves", ['index' => 4, 'expected_version' => $v++]);
        $this->withHeader('X-Participant-Token', $hostToken)->postJson("/api/games/{$gameId}/moves", ['index' => 2, 'expected_version' => $v++]);

        // Host requests rematch
        $rematch1 = $this->withHeader('X-Participant-Token', $hostToken)
            ->postJson("/api/games/{$gameId}/rematch");

        $rematch1->assertOk();
        $this->assertSame('host', $rematch1->json('state.rematch_requested_by'));
        $this->assertSame('won', $rematch1->json('state.status'));

        // Guest accepts rematch
        $rematch2 = $this->withHeader('X-Participant-Token', $guestToken)
            ->postJson("/api/games/{$gameId}/rematch");

        $rematch2->assertOk();
        $this->assertSame('in_progress', $rematch2->json('state.status'));
        $this->assertNull($rematch2->json('state.rematch_requested_by'));
        $this->assertSame(array_fill(0, 9, null), $rematch2->json('state.board'));
    }

    public function test_channel_authorization(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => '123456',
        ]);
        require base_path('routes/channels.php');

        $createResponse = $this->postJson('/api/games');
        $gameId = $createResponse->json('game_id');
        $hostToken = $createResponse->json('participant_token');

        // Unauthorized when token missing
        $unauth = $this->post('/broadcasting/auth', [
            'channel_name' => "private-games.{$gameId}",
            'socket_id' => '1234.5678',
        ]);
        $unauth->assertStatus(403);

        // Authorized with valid host token
        $auth = $this->withHeader('X-Participant-Token', $hostToken)
            ->post('/broadcasting/auth', [
                'channel_name' => "private-games.{$gameId}",
                'socket_id' => '1234.5678',
            ]);
        $auth->assertOk();
    }
}
