<?php

declare(strict_types=1);

namespace App\Domain\TicTacToe;

use App\Domain\TicTacToe\Exceptions\InvalidMoveException;

final readonly class Board
{
    /**
     * @param  array<int, ?Player>  $cells
     */
    public function __construct(
        private array $cells,
    ) {
        if (count($this->cells) !== 9) {
            throw new \InvalidArgumentException('Board must contain exactly 9 cells.');
        }
    }

    public static function empty(): self
    {
        return new self(array_fill(0, 9, null));
    }

    /**
     * @param  array<int, string|Player|null>  $raw
     */
    public static function fromArray(array $raw): self
    {
        $cells = [];
        for ($i = 0; $i < 9; $i++) {
            $value = $raw[$i] ?? null;
            if ($value instanceof Player) {
                $cells[$i] = $value;
            } elseif ($value === 'X' || $value === 'x') {
                $cells[$i] = Player::X;
            } elseif ($value === 'O' || $value === 'o') {
                $cells[$i] = Player::O;
            } else {
                $cells[$i] = null;
            }
        }

        return new self($cells);
    }

    public function getCell(int $index): ?Player
    {
        $this->assertIndexInBounds($index);

        return $this->cells[$index];
    }

    public function isCellEmpty(int $index): bool
    {
        return $this->getCell($index) === null;
    }

    public function withMove(int $index, Player $player): self
    {
        $this->assertIndexInBounds($index);

        if (! $this->isCellEmpty($index)) {
            throw InvalidMoveException::cellOccupied($index);
        }

        $nextCells = $this->cells;
        $nextCells[$index] = $player;

        return new self($nextCells);
    }

    /**
     * @return list<int>
     */
    public function availableIndices(): array
    {
        $indices = [];
        foreach ($this->cells as $index => $player) {
            if ($player === null) {
                $indices[] = $index;
            }
        }

        return $indices;
    }

    public function isFull(): bool
    {
        return empty($this->availableIndices());
    }

    /**
     * @return array<int, ?string>
     */
    public function toArray(): array
    {
        return array_map(fn (?Player $p) => $p?->value, $this->cells);
    }

    private function assertIndexInBounds(int $index): void
    {
        if ($index < 0 || $index > 8) {
            throw InvalidMoveException::outOfBounds($index);
        }
    }
}
