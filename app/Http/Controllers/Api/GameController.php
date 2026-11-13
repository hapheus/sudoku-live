<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\TicTacToe\Exceptions\InvalidMoveException;
use App\Events\GameUpdated;
use App\Http\Controllers\Controller;
use App\Models\Game;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

final class GameController extends Controller
{
    public function store(): JsonResponse
    {
        $hostToken = bin2hex(random_bytes(32));
        $game = Game::createNew($hostToken);

        return response()->json([
            'game_id' => $game->id,
            'participant_token' => $hostToken,
            'role' => 'host',
            'symbol' => 'X',
            'invite_url' => url("/games/{$game->id}"),
            'state' => $game->toPublicState('host'),
        ], Response::HTTP_CREATED);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $game = Game::findOrFail($id);
        $token = $request->header('X-Participant-Token') ?? $request->input('participant_token');
        $role = is_string($token) ? $game->resolveRole($token) : null;

        return response()->json([
            'state' => $game->toPublicState($role),
        ]);
    }

    public function join(Request $request, string $id): JsonResponse
    {
        $game = Game::findOrFail($id);
        $token = $request->header('X-Participant-Token') ?? $request->input('participant_token');

        // Allow existing participants to reconnect
        if (is_string($token) && ($role = $game->resolveRole($token)) !== null) {
            return response()->json([
                'game_id' => $game->id,
                'participant_token' => $token,
                'role' => $role,
                'symbol' => $role === 'host' ? $game->host_symbol : $game->guest_symbol,
                'state' => $game->toPublicState($role),
            ]);
        }

        if ($game->hasGuest()) {
            return response()->json(['message' => 'Game is already full.'], Response::HTTP_CONFLICT);
        }

        $guestToken = bin2hex(random_bytes(32));
        $guestTokenHash = hash('sha256', $guestToken);

        $affected = DB::table('games')
            ->where('id', $game->id)
            ->whereNull('guest_token_hash')
            ->update([
                'guest_token_hash' => $guestTokenHash,
                'status' => 'in_progress',
                'version' => DB::raw('version + 1'),
                'updated_at' => now(),
            ]);

        if ($affected === 0) {
            return response()->json(['message' => 'Game is already full.'], Response::HTTP_CONFLICT);
        }

        $game->refresh();
        GameUpdated::dispatch($game);

        return response()->json([
            'game_id' => $game->id,
            'participant_token' => $guestToken,
            'role' => 'guest',
            'symbol' => $game->guest_symbol,
            'state' => $game->toPublicState('guest'),
        ]);
    }

    public function makeMove(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'index' => 'required|integer|between:0,8',
            'expected_version' => 'required|integer',
        ]);

        $token = $request->header('X-Participant-Token') ?? $request->input('participant_token');
        if (! is_string($token) || $token === '') {
            return response()->json(['message' => 'Missing participant token.'], Response::HTTP_UNAUTHORIZED);
        }

        $game = Game::findOrFail($id);
        $role = $game->resolveRole($token);
        if ($role === null) {
            return response()->json(['message' => 'Invalid participant token.'], Response::HTTP_FORBIDDEN);
        }

        if ($game->status !== 'in_progress') {
            return response()->json(['message' => 'Game is not in progress.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $player = $game->resolvePlayer($token);
        if ($player === null || $game->current_turn !== $player->value) {
            return response()->json(['message' => 'It is not your turn.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ((int) $validated['expected_version'] !== $game->version) {
            return response()->json(['message' => 'Game state conflict. Please refresh.'], Response::HTTP_CONFLICT);
        }

        $currentGameState = $game->toGameState();

        try {
            $nextGameState = $currentGameState->makeMove((int) $validated['index'], $player);
        } catch (InvalidMoveException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $affected = DB::table('games')
            ->where('id', $game->id)
            ->where('version', $game->version)
            ->update([
                'board' => json_encode($nextGameState->board->toArray()),
                'current_turn' => $nextGameState->currentTurn->value,
                'status' => $nextGameState->status->value,
                'winner' => $nextGameState->winner?->value,
                'winning_indices' => $nextGameState->winningIndices ? json_encode($nextGameState->winningIndices) : null,
                'version' => DB::raw('version + 1'),
                'updated_at' => now(),
            ]);

        if ($affected === 0) {
            return response()->json(['message' => 'Game state conflict. Please refresh.'], Response::HTTP_CONFLICT);
        }

        $game->refresh();
        GameUpdated::dispatch($game);

        return response()->json([
            'state' => $game->toPublicState($role),
        ]);
    }

    public function rematch(Request $request, string $id): JsonResponse
    {
        $token = $request->header('X-Participant-Token') ?? $request->input('participant_token');
        if (! is_string($token) || $token === '') {
            return response()->json(['message' => 'Missing participant token.'], Response::HTTP_UNAUTHORIZED);
        }

        $game = Game::findOrFail($id);
        $role = $game->resolveRole($token);
        if ($role === null) {
            return response()->json(['message' => 'Invalid participant token.'], Response::HTTP_FORBIDDEN);
        }

        if ($game->status !== 'won' && $game->status !== 'draw') {
            return response()->json(['message' => 'Game is not finished.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ($game->rematch_requested_by === null) {
            $game->rematch_requested_by = $role;
            $game->version++;
            $game->save();

            GameUpdated::dispatch($game);

            return response()->json([
                'state' => $game->toPublicState($role),
            ]);
        }

        if ($game->rematch_requested_by === $role) {
            return response()->json([
                'state' => $game->toPublicState($role),
            ]);
        }

        // Both players requested rematch: reset board
        $game->board = array_fill(0, 9, null);
        $game->current_turn = 'X';
        $game->status = 'in_progress';
        $game->winner = null;
        $game->winning_indices = null;
        $game->rematch_requested_by = null;
        $game->version++;
        $game->save();

        GameUpdated::dispatch($game);

        return response()->json([
            'state' => $game->toPublicState($role),
        ]);
    }
}
