<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Auth\GenericUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Auth::viaRequest('participant', function (Request $request) {
            $clientId = $request->header('X-Client-Id')
                ?? $request->input('client_id')
                ?? $request->header('X-Participant-Token')
                ?? $request->input('participant_token')
                ?? ('client_'.bin2hex(random_bytes(6)));

            return new GenericUser([
                'id' => (string) $clientId,
                'name' => (string) $clientId,
            ]);
        });
    }
}
