<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\TicTacToe;

use App\Domain\TicTacToe\AiDifficulty;
use App\Domain\TicTacToe\Board;
use App\Domain\TicTacToe\ComputerOpponent;
use App\Domain\TicTacToe\GameRules;
use App\Domain\TicTacToe\Player;
use PHPUnit\Framework\TestCase;

final class ComputerOpponentTest extends TestCase
{
    private ComputerOpponent $ai;

    private GameRules $rules;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rules = new GameRules;
        $this->ai = new ComputerOpponent($this->rules);
    }

    public function test_easy_selects_an_available_move(): void
    {
        $board = Board::fromArray([
            'X', 'O', 'X',
            'O', null, 'X',
            'O', 'X', 'O',
        ]);

        $move = $this->ai->selectMove($board, Player::X, AiDifficulty::Easy);

        $this->assertSame(4, $move);
    }

    public function test_easy_always_picks_from_available_indices(): void
    {
        $board = Board::fromArray([
            'X', null, 'O',
            null, 'X', null,
            null, null, 'O',
        ]);

        $available = $board->availableIndices();

        for ($i = 0; $i < 20; $i++) {
            $move = $this->ai->selectMove($board, Player::O, AiDifficulty::Easy);
            $this->assertContains($move, $available);
        }
    }

    public function test_medium_takes_immediate_win(): void
    {
        // AI is O. Row 0: O, O, null. AI must pick 2 to win!
        // Also opponent X has row 1: X, X, null (index 5)
        // Taking immediate win (2) must precede blocking (5)!
        $board = Board::fromArray([
            'O', 'O', null,
            'X', 'X', null,
            null, null, null,
        ]);

        $move = $this->ai->selectMove($board, Player::O, AiDifficulty::Medium);

        $this->assertSame(2, $move);
    }

    public function test_medium_blocks_opponent_immediate_win(): void
    {
        // Opponent is X. X has row 0: X, X, null (2).
        // AI is O. AI must block at 2.
        $board = Board::fromArray([
            'X', 'X', null,
            null, 'O', null,
            null, null, null,
        ]);

        $move = $this->ai->selectMove($board, Player::O, AiDifficulty::Medium);

        $this->assertSame(2, $move);
    }

    public function test_hard_takes_immediate_win(): void
    {
        $board = Board::fromArray([
            'X', 'X', null,
            'O', 'O', null,
            null, null, null,
        ]);

        $move = $this->ai->selectMove($board, Player::X, AiDifficulty::Hard);

        $this->assertSame(2, $move);
    }

    public function test_hard_blocks_opponent_win(): void
    {
        $board = Board::fromArray([
            'X', 'X', null,
            null, 'O', null,
            null, null, null,
        ]);

        $move = $this->ai->selectMove($board, Player::O, AiDifficulty::Hard);

        $this->assertSame(2, $move);
    }

    public function test_hard_never_loses_when_opponent_plays_all_possible_games(): void
    {
        // AI plays as O (second player).
        // We will traverse all possible legal moves that X can make.
        // Hard AI must never lose (winner must never be X).
        $this->assertAiNeverLoses(Board::empty(), Player::X, Player::O);
    }

    public function test_hard_never_loses_when_ai_starts_first(): void
    {
        // AI plays as X (first player).
        $board = Board::empty();
        $firstMove = $this->ai->selectMove($board, Player::X, AiDifficulty::Hard);
        $board = $board->withMove($firstMove, Player::X);

        $this->assertAiNeverLoses($board, Player::O, Player::X);
    }

    private function assertAiNeverLoses(Board $board, Player $turn, Player $aiPlayer): void
    {
        $winner = $this->rules->checkWinner($board);
        if ($winner !== null) {
            $this->assertNotSame(
                $aiPlayer->opponent(),
                $winner->player,
                'Hard AI lost to opponent! Board: '.json_encode($board->toArray())
            );

            return;
        }

        if ($board->isFull()) {
            return;
        }

        if ($turn === $aiPlayer) {
            $aiMove = $this->ai->selectMove($board, $aiPlayer, AiDifficulty::Hard);
            $this->assertAiNeverLoses(
                $board->withMove($aiMove, $aiPlayer),
                $aiPlayer->opponent(),
                $aiPlayer
            );
        } else {
            // Test against EVERY legal opponent move
            foreach ($board->availableIndices() as $opponentMove) {
                $this->assertAiNeverLoses(
                    $board->withMove($opponentMove, $turn),
                    $aiPlayer,
                    $aiPlayer
                );
            }
        }
    }
}
