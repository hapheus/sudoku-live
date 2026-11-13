<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Centrifugo Server-to-Server Configuration
    |--------------------------------------------------------------------------
    |
    | Used by Laravel to call Centrifugo's HTTP Server API (/api/publish)
    | and to sign short-lived HS256 JWT connection and subscription tokens.
    |
    */

    'internal_url' => env('CENTRIFUGO_INTERNAL_URL', 'http://localhost:8081'),

    'api_key' => env('CENTRIFUGO_API_KEY', 'sudokulive-api-key'),

    'hmac_secret' => env('CENTRIFUGO_HMAC_SECRET', 'sudokulive-hmac-secret-change-me-32bytes'),

    'token_ttl' => (int) env('CENTRIFUGO_TOKEN_TTL', 3600),

    /*
    |--------------------------------------------------------------------------
    | Public WebSocket Endpoint (Browser / Mobile Client)
    |--------------------------------------------------------------------------
    |
    | Exposed to the browser via data-ws-* attributes so internal Docker
    | communication (e.g. http://centrifugo:8080) stays separate from the
    | public WebSocket endpoint (e.g. wss://sudoku-ws.example.com).
    |
    */

    'public_host' => env('CENTRIFUGO_PUBLIC_HOST', 'localhost'),

    'public_port' => (int) env('CENTRIFUGO_PUBLIC_PORT', 8081),

    'public_scheme' => env('CENTRIFUGO_PUBLIC_SCHEME', 'http'),

    'public_ws_url' => env('CENTRIFUGO_PUBLIC_WS_URL'),
];
