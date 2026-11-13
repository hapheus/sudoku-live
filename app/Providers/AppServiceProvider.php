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
            $token = $request->header('X-Participant-Token') ?? $request->input('participant_token');

            if (! is_string($token) || $token === '') {
                return null;
            }

            return new GenericUser([
                'id' => hash('sha256', $token),
                'token' => $token,
            ]);
        });
    }
}
