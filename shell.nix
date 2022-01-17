{ pkgs }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    (import ./ci.nix { inherit pkgs; })
    solana-basic
    cargo-deps
    gh
    spl-token-cli
  ];
}
