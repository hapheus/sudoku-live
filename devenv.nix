{ pkgs, lib, config, inputs, ... }:

{
  # https://devenv.sh/basics/
  languages.php = {
    enable = true;
    version = "8.4";
  };

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    npm.enable = true;
  };

  packages = [
    pkgs.php84Packages.composer
  ];

  # Background processes managed via `devenv up`
  # Start the WebSocket server separately via: docker compose up -d centrifugo
  processes = {
    server.exec = "php artisan serve --port=8000";
    vite.exec = "npm run dev";
  };

  scripts = {
    setup.exec = ''
      if [ ! -f .env ]; then
        cp .env.example .env
        php artisan key:generate
      fi
      composer install
      npm install
    '';
    test.exec = ''
      php artisan test
      npm run test
    '';
  };

  enterShell = ''
    echo "Sudoku Live development environment ready."
  '';
}
