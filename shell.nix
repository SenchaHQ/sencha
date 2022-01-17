{ pkgs }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    (import ./ci.nix { inherit pkgs; })
    cargo-deps
    gh
    spl-token-cli
  ];
}
