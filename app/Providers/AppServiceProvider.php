<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Auth\GenericUser;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
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
        RateLimiter::for('game-events', function (Request $request): Limit {
            $clientIp = $request->header('CF-Connecting-IP') ?: $request->ip();

            return Limit::perMinute(180)->by((string) $clientIp);
        });

        Auth::viaRequest('participant', function (Request $request) {
            $rawClientId = $request->header('X-Client-Id')
                ?? $request->input('client_id')
                ?? $request->header('X-Participant-Token')
                ?? $request->input('participant_token');

            $clientId = is_string($rawClientId) && preg_match('/^[A-Za-z0-9_-]{4,64}$/', $rawClientId) === 1
                ? $rawClientId
                : 'client_'.bin2hex(random_bytes(6));

            return new GenericUser([
                'id' => $clientId,
                'name' => $clientId,
            ]);
        });
    }
}
