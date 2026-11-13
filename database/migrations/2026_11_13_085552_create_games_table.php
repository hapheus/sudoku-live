<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('games', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('status', 20)->default('waiting'); // waiting, in_progress, won, draw
            $table->json('board');
            $table->string('current_turn', 1)->default('X');
            $table->string('winner', 1)->nullable();
            $table->json('winning_indices')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->string('host_token_hash', 64);
            $table->string('guest_token_hash', 64)->nullable();
            $table->string('host_symbol', 1)->default('X');
            $table->string('guest_symbol', 1)->default('O');
            $table->string('rematch_requested_by', 10)->nullable();
            $table->timestamps();

            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('games');
    }
};
