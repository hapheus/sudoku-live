<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

use App\Domain\TicTacToe\Exceptions\InvalidMoveException;

final readonly class GameState
{
    /**
     * @param  list<int>|null  $winningIndices
     */
    public function __construct(
        public Board $board,
        public Player $currentTurn,
        public GameStatus $status,
        public ?Player $winner = null,
        public ?array $winningIndices = null,
        public int $moveCount = 0,
    ) {}

    public static function newGame(Player $startingPlayer = Player::X): self
    {
        return new self(
            board: Board::empty(),
            currentTurn: $startingPlayer,
            status: GameStatus::InProgress,
            winner: null,
            winningIndices: null,
            moveCount: 0,
        );
    }

    public function makeMove(int $index, ?Player $player = null, ?GameRules $rules = null): self
    {
        if ($this->status->isFinished()) {
            throw InvalidMoveException::gameAlreadyFinished();
        }

        $player = $player ?? $this->currentTurn;

        if ($player !== $this->currentTurn) {
            throw InvalidMoveException::notPlayersTurn();
        }

        $rules = $rules ?? new GameRules;
        $nextBoard = $this->board->withMove($index, $player);
        $nextMoveCount = $this->moveCount + 1;

        $winningLine = $rules->checkWinner($nextBoard);

        if ($winningLine !== null) {
            return new self(
                board: $nextBoard,
                currentTurn: $player, // or currentTurn doesn't matter after finish
                status: GameStatus::Won,
                winner: $winningLine->player,
                winningIndices: $winningLine->indices,
                moveCount: $nextMoveCount,
            );
        }

        if ($rules->isDraw($nextBoard)) {
            return new self(
                board: $nextBoard,
                currentTurn: $player->opponent(),
                status: GameStatus::Draw,
                winner: null,
                winningIndices: null,
                moveCount: $nextMoveCount,
            );
        }

        return new self(
            board: $nextBoard,
            currentTurn: $player->opponent(),
            status: GameStatus::InProgress,
            winner: null,
            winningIndices: null,
            moveCount: $nextMoveCount,
        );
    }

    /**
     * @return array{
     *     board: array<int, ?string>,
     *     current_turn: string,
     *     status: string,
     *     winner: ?string,
     *     winning_indices: ?list<int>,
     *     move_count: int
     * }
     */
    public function toArray(): array
    {
        return [
            'board' => $this->board->toArray(),
            'current_turn' => $this->currentTurn->value,
            'status' => $this->status->value,
            'winner' => $this->winner?->value,
            'winning_indices' => $this->winningIndices,
            'move_count' => $this->moveCount,
        ];
    }

    /**
     * @param array{
     *     board: array<int, ?string>,
     *     current_turn: string,
     *     status: string,
     *     winner?: ?string,
     *     winning_indices?: ?list<int>,
     *     move_count?: int
     * } $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            board: Board::fromArray($data['board']),
            currentTurn: Player::from($data['current_turn']),
            status: GameStatus::from($data['status']),
            winner: isset($data['winner']) && $data['winner'] !== null ? Player::from($data['winner']) : null,
            winningIndices: $data['winning_indices'] ?? null,
            moveCount: $data['move_count'] ?? 0,
        );
    }
}
