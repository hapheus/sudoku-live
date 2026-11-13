<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\TicTacToe;

use App\Domain\TicTacToe\Exceptions\InvalidMoveException;
use App\Domain\TicTacToe\GameState;
use App\Domain\TicTacToe\GameStatus;
use App\Domain\TicTacToe\Player;
use PHPUnit\Framework\TestCase;

final class GameStateTest extends TestCase
{
    public function test_new_game_has_empty_board_and_turn_x(): void
    {
        $state = GameState::newGame();

        $this->assertSame(Player::X, $state->currentTurn);
        $this->assertSame(GameStatus::InProgress, $state->status);
        $this->assertNull($state->winner);
        $this->assertNull($state->winningIndices);
        $this->assertSame(0, $state->moveCount);
        $this->assertSame(array_fill(0, 9, null), $state->board->toArray());
    }

    public function test_making_valid_moves_alternates_turns(): void
    {
        $state = GameState::newGame();

        $state1 = $state->makeMove(0, Player::X);
        $this->assertSame(Player::O, $state1->currentTurn);
        $this->assertSame(1, $state1->moveCount);
        $this->assertSame('X', $state1->board->toArray()[0]);

        $state2 = $state1->makeMove(4, Player::O);
        $this->assertSame(Player::X, $state2->currentTurn);
        $this->assertSame(2, $state2->moveCount);
        $this->assertSame('O', $state2->board->toArray()[4]);
    }

    public function test_rejects_out_of_bounds_move(): void
    {
        $state = GameState::newGame();

        $this->expectException(InvalidMoveException::class);
        $state->makeMove(9);
    }

    public function test_rejects_negative_index_move(): void
    {
        $state = GameState::newGame();

        $this->expectException(InvalidMoveException::class);
        $state->makeMove(-1);
    }

    public function test_rejects_move_on_occupied_cell(): void
    {
        $state = GameState::newGame()->makeMove(0, Player::X);

        $this->expectException(InvalidMoveException::class);
        $state->makeMove(0, Player::O);
    }

    public function test_rejects_move_from_wrong_player(): void
    {
        $state = GameState::newGame(); // Current turn is X

        $this->expectException(InvalidMoveException::class);
        $state->makeMove(0, Player::O);
    }

    public function test_game_transitions_to_won_on_winning_move(): void
    {
        // X plays 0, O plays 3
        // X plays 1, O plays 4
        // X plays 2 (wins row 0)
        $state = GameState::newGame()
            ->makeMove(0) // X
            ->makeMove(3) // O
            ->makeMove(1) // X
            ->makeMove(4) // O
            ->makeMove(2); // X

        $this->assertSame(GameStatus::Won, $state->status);
        $this->assertSame(Player::X, $state->winner);
        $this->assertSame([0, 1, 2], $state->winningIndices);
    }

    public function test_rejects_moves_after_game_is_won(): void
    {
        $state = GameState::newGame()
            ->makeMove(0) // X
            ->makeMove(3) // O
            ->makeMove(1) // X
            ->makeMove(4) // O
            ->makeMove(2); // X (won)

        $this->expectException(InvalidMoveException::class);
        $state->makeMove(8);
    }

    public function test_game_transitions_to_draw(): void
    {
        // 0 1 2
        // 3 4 5
        // 6 7 8
        // Sequence:
        // X: 0, O: 1
        // X: 2, O: 4
        // X: 3, O: 5
        // X: 7, O: 6
        // X: 8
        // Board:
        // X O X
        // X O O
        // O X X
        $state = GameState::newGame()
            ->makeMove(0) // X
            ->makeMove(1) // O
            ->makeMove(2) // X
            ->makeMove(4) // O
            ->makeMove(3) // X
            ->makeMove(5) // O
            ->makeMove(7) // X
            ->makeMove(6) // O
            ->makeMove(8); // X

        $this->assertSame(GameStatus::Draw, $state->status);
        $this->assertNull($state->winner);
        $this->assertNull($state->winningIndices);
        $this->assertSame(9, $state->moveCount);
    }
}
