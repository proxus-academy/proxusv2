{
  description = "Proxus v2 development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          pnpm = pkgs.writeShellScriptBin "pnpm" ''
            exec ${pkgs.corepack}/bin/corepack pnpm "$@"
          '';
          stack = pkgs.writeShellScriptBin "stack" ''
            exec ${pkgs.corepack}/bin/corepack pnpm dlx @kitlangton/stack@0.4.2 "$@"
          '';
        in {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.corepack
              pkgs.bun
              pkgs.git
              pkgs.gh
              pkgs.actionlint
              pkgs.shellcheck
              pnpm
              stack
            ];

            shellHook = ''
              echo "Proxus dev shell: Node $(node --version), pnpm $(pnpm --version), Bun $(bun --version)"
            '';
          };
        });
    };
}
