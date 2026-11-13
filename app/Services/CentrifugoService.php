<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class CentrifugoService
{
    public function __construct(
        private readonly string $internalUrl,
        private readonly string $apiKey,
        private readonly string $hmacSecret,
        private readonly int $tokenTtl = 3600,
    ) {}

    public static function fromConfig(): self
    {
        return new self(
            internalUrl: (string) config('centrifugo.internal_url', 'http://localhost:8081'),
            apiKey: (string) config('centrifugo.api_key', ''),
            hmacSecret: (string) config('centrifugo.hmac_secret', ''),
            tokenTtl: max(60, (int) config('centrifugo.token_ttl', 3600)),
        );
    }

    public function resolveClientId(?string $rawClientId): string
    {
        if (is_string($rawClientId) && preg_match('/^[A-Za-z0-9_-]{4,64}$/', $rawClientId) === 1) {
            return $rawClientId;
        }

        return 'client_'.bin2hex(random_bytes(6));
    }

    /**
     * @param  array<string, mixed>  $info
     */
    public function generateConnectionToken(string $clientId, array $info = []): string
    {
        $claims = [
            'sub' => $clientId,
            'exp' => time() + $this->tokenTtl,
        ];

        if ($info !== []) {
            $claims['info'] = $info;
        }

        return $this->encodeJwt($claims);
    }

    /**
     * @param  array<string, mixed>  $info
     */
    public function generateSubscriptionToken(string $clientId, string $channel, array $info = []): string
    {
        $claims = [
            'sub' => $clientId,
            'channel' => $channel,
            'exp' => time() + $this->tokenTtl,
        ];

        if ($info !== []) {
            $claims['info'] = $info;
        }

        return $this->encodeJwt($claims);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function publish(string $channel, array $data): bool
    {
        if ($this->internalUrl === '' || $this->apiKey === '') {
            return false;
        }

        try {
            $response = Http::withHeaders([
                'X-API-Key' => $this->apiKey,
            ])
                ->acceptJson()
                ->timeout(3)
                ->post(rtrim($this->internalUrl, '/').'/api/publish', [
                    'channel' => $channel,
                    'data' => $data,
                ]);

            return $response->successful();
        } catch (ConnectionException) {
            return false;
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function encodeJwt(array $payload): string
    {
        if ($this->hmacSecret === '') {
            throw new RuntimeException('CENTRIFUGO_HMAC_SECRET must be configured.');
        }

        $headerSegment = $this->base64UrlEncode((string) json_encode([
            'typ' => 'JWT',
            'alg' => 'HS256',
        ], JSON_THROW_ON_ERROR));

        $payloadSegment = $this->base64UrlEncode((string) json_encode($payload, JSON_THROW_ON_ERROR));

        $signature = hash_hmac('sha256', "{$headerSegment}.{$payloadSegment}", $this->hmacSecret, true);
        $signatureSegment = $this->base64UrlEncode($signature);

        return "{$headerSegment}.{$payloadSegment}.{$signatureSegment}";
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
