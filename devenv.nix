{ pkgs, lib, config, inputs, ... }:

{
  # https://devenv.sh/basics/
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    npm.enable = true;
  };

  # Background processes managed via `devenv up`
  # Start Centrifugo locally via: docker compose up -d centrifugo
  processes = {
    vite.exec = "npm run dev -- --port 8000";
  };

  scripts = {
    setup.exec = ''
      npm install
    '';
    test.exec = ''
      npm run test
    '';
  };

  enterShell = ''
    echo "Sudoku Live (React + Capacitor + Centrifugo) environment ready."
  '';
}
