<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\TicTacToe\Board;
use App\Domain\TicTacToe\GameState;
use App\Domain\TicTacToe\GameStatus;
use App\Domain\TicTacToe\Player;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $status
 * @property array<int, ?string> $board
 * @property string $current_turn
 * @property ?string $winner
 * @property ?list<int> $winning_indices
 * @property int $version
 * @property string $host_token_hash
 * @property ?string $guest_token_hash
 * @property string $host_symbol
 * @property string $guest_symbol
 * @property ?string $rematch_requested_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
final class Game extends Model
{
    use HasUuids;

    protected $table = 'games';

    protected $fillable = [
        'id',
        'status',
        'board',
        'current_turn',
        'winner',
        'winning_indices',
        'version',
        'host_token_hash',
        'guest_token_hash',
        'host_symbol',
        'guest_symbol',
        'rematch_requested_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'board' => 'array',
            'winning_indices' => 'array',
            'version' => 'integer',
        ];
    }

    public static function createNew(string $hostToken): self
    {
        $game = new self;
        $game->status = 'waiting';
        $game->board = array_fill(0, 9, null);
        $game->current_turn = Player::X->value;
        $game->winner = null;
        $game->winning_indices = null;
        $game->version = 1;
        $game->host_token_hash = hash('sha256', $hostToken);
        $game->host_symbol = Player::X->value;
        $game->guest_symbol = Player::O->value;
        $game->rematch_requested_by = null;
        $game->save();

        return $game;
    }

    public function resolveRole(string $token): ?string
    {
        $hash = hash('sha256', $token);

        if (hash_equals($this->host_token_hash, $hash)) {
            return 'host';
        }

        if ($this->guest_token_hash !== null && hash_equals($this->guest_token_hash, $hash)) {
            return 'guest';
        }

        return null;
    }

    public function resolvePlayer(string $token): ?Player
    {
        $role = $this->resolveRole($token);

        return match ($role) {
            'host' => Player::from($this->host_symbol),
            'guest' => Player::from($this->guest_symbol),
            default => null,
        };
    }

    public function hasGuest(): bool
    {
        return $this->guest_token_hash !== null;
    }

    public function toGameState(): GameState
    {
        return new GameState(
            board: Board::fromArray($this->board),
            currentTurn: Player::from($this->current_turn),
            status: match ($this->status) {
                'waiting' => GameStatus::InProgress, // Domain treats board state
                'in_progress' => GameStatus::InProgress,
                'won' => GameStatus::Won,
                'draw' => GameStatus::Draw,
                default => GameStatus::InProgress,
            },
            winner: $this->winner ? Player::from($this->winner) : null,
            winningIndices: $this->winning_indices,
            moveCount: count(array_filter($this->board, fn ($c) => $c !== null)),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicState(?string $participantRole = null): array
    {
        $yourSymbol = match ($participantRole) {
            'host' => $this->host_symbol,
            'guest' => $this->guest_symbol,
            default => null,
        };

        return [
            'id' => $this->id,
            'status' => $this->status,
            'board' => $this->board,
            'current_turn' => $this->current_turn,
            'winner' => $this->winner,
            'winning_indices' => $this->winning_indices,
            'version' => $this->version,
            'host_symbol' => $this->host_symbol,
            'guest_symbol' => $this->guest_symbol,
            'has_guest' => $this->hasGuest(),
            'rematch_requested_by' => $this->rematch_requested_by,
            'your_role' => $participantRole,
            'your_symbol' => $yourSymbol,
            'is_your_turn' => $yourSymbol !== null && $this->status === 'in_progress' && $this->current_turn === $yourSymbol,
        ];
    }
}
