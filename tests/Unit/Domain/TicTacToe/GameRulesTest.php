<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\TicTacToe;

use App\Domain\TicTacToe\Board;
use App\Domain\TicTacToe\GameRules;
use App\Domain\TicTacToe\GameStatus;
use App\Domain\TicTacToe\Player;
use PHPUnit\Framework\TestCase;

final class GameRulesTest extends TestCase
{
    private GameRules $rules;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rules = new GameRules;
    }

    public function test_empty_board_is_in_progress(): void
    {
        $board = Board::empty();

        $this->assertNull($this->rules->checkWinner($board));
        $this->assertFalse($this->rules->isDraw($board));
        $this->assertSame(GameStatus::InProgress, $this->rules->determineStatus($board));
    }

    public function test_detects_horizontal_wins(): void
    {
        // Row 0: [0, 1, 2]
        $board = Board::fromArray([
            'X', 'X', 'X',
            null, 'O', null,
            'O', null, null,
        ]);

        $winningLine = $this->rules->checkWinner($board);
        $this->assertNotNull($winningLine);
        $this->assertSame(Player::X, $winningLine->player);
        $this->assertSame([0, 1, 2], $winningLine->indices);
        $this->assertSame(GameStatus::Won, $this->rules->determineStatus($board));

        // Row 1: [3, 4, 5]
        $board2 = Board::fromArray([
            'X', null, 'X',
            'O', 'O', 'O',
            null, 'X', null,
        ]);
        $winningLine2 = $this->rules->checkWinner($board2);
        $this->assertNotNull($winningLine2);
        $this->assertSame(Player::O, $winningLine2->player);
        $this->assertSame([3, 4, 5], $winningLine2->indices);

        // Row 2: [6, 7, 8]
        $board3 = Board::fromArray([
            null, 'O', null,
            'O', null, 'O',
            'X', 'X', 'X',
        ]);
        $winningLine3 = $this->rules->checkWinner($board3);
        $this->assertNotNull($winningLine3);
        $this->assertSame(Player::X, $winningLine3->player);
        $this->assertSame([6, 7, 8], $winningLine3->indices);
    }

    public function test_detects_vertical_wins(): void
    {
        // Col 0: [0, 3, 6]
        $board = Board::fromArray([
            'O', 'X', null,
            'O', 'X', null,
            'O', null, 'X',
        ]);
        $winningLine = $this->rules->checkWinner($board);
        $this->assertNotNull($winningLine);
        $this->assertSame(Player::O, $winningLine->player);
        $this->assertSame([0, 3, 6], $winningLine->indices);

        // Col 1: [1, 4, 7]
        $board2 = Board::fromArray([
            null, 'X', 'O',
            null, 'X', 'O',
            'O', 'X', null,
        ]);
        $this->assertSame([1, 4, 7], $this->rules->checkWinner($board2)?->indices);

        // Col 2: [2, 5, 8]
        $board3 = Board::fromArray([
            'X', null, 'O',
            'X', null, 'O',
            null, 'X', 'O',
        ]);
        $this->assertSame([2, 5, 8], $this->rules->checkWinner($board3)?->indices);
    }

    public function test_detects_diagonal_wins(): void
    {
        // Main diagonal: [0, 4, 8]
        $board = Board::fromArray([
            'X', 'O', null,
            'O', 'X', null,
            null, 'O', 'X',
        ]);
        $winningLine = $this->rules->checkWinner($board);
        $this->assertNotNull($winningLine);
        $this->assertSame(Player::X, $winningLine->player);
        $this->assertSame([0, 4, 8], $winningLine->indices);

        // Anti-diagonal: [2, 4, 6]
        $board2 = Board::fromArray([
            'X', null, 'O',
            'X', 'O', null,
            'O', null, 'X',
        ]);
        $winningLine2 = $this->rules->checkWinner($board2);
        $this->assertNotNull($winningLine2);
        $this->assertSame(Player::O, $winningLine2->player);
        $this->assertSame([2, 4, 6], $winningLine2->indices);
    }

    public function test_detects_draw(): void
    {
        // Full board with no 3-in-a-row
        // X O X
        // X X O
        // O X O
        $board = Board::fromArray([
            'X', 'O', 'X',
            'X', 'X', 'O',
            'O', 'X', 'O',
        ]);

        $this->assertNull($this->rules->checkWinner($board));
        $this->assertTrue($this->rules->isDraw($board));
        $this->assertSame(GameStatus::Draw, $this->rules->determineStatus($board));
    }

    public function test_full_board_with_winner_is_won_not_draw(): void
    {
        // X X X
        // O O X
        // O X O
        $board = Board::fromArray([
            'X', 'X', 'X',
            'O', 'O', 'X',
            'O', 'X', 'O',
        ]);

        $this->assertNotNull($this->rules->checkWinner($board));
        $this->assertFalse($this->rules->isDraw($board));
        $this->assertSame(GameStatus::Won, $this->rules->determineStatus($board));
    }
}
