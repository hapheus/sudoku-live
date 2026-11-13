<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe\Exceptions;

use DomainException;

final class InvalidMoveException extends DomainException
{
    public static function outOfBounds(int $index): self
    {
        return new self("Move index {$index} is out of bounds. Must be between 0 and 8.");
    }

    public static function cellOccupied(int $index): self
    {
        return new self("Board cell {$index} is already occupied.");
    }

    public static function gameAlreadyFinished(): self
    {
        return new self('Cannot make a move in a finished game.');
    }

    public static function notPlayersTurn(): self
    {
        return new self('It is not your turn.');
    }
}
