{ pkgs }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    (import ./ci.nix { inherit pkgs; })
    solana-cli
    solana-keygen
    cargo-deps
    gh
    spl-token-cli
  ];
}
