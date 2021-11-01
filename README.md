# Sencha 🍵

[![License](https://img.shields.io/badge/license-AGPL%203.0-blue)](https://github.com/SenchaHQ/sencha/blob/master/LICENSE.md)
[![Build Status](https://img.shields.io/github/workflow/status/SenchaHQ/sencha/E2E/master)](https://github.com/SenchaHQ/sencha/actions/workflows/programs-e2e.yml?query=branch%3Amaster)
[![Contributors](https://img.shields.io/github/contributors/SenchaHQ/sencha)](https://github.com/SenchaHQ/sencha/graphs/contributors)

![Sencha](/images/banner.png)

Sencha is an automated market maker for Solana tokens.

We're in active development. For the latest updates, please join our community:

- Twitter: https://twitter.com/SenchaDEX
- Chat: https://chat.sencha.so

## Note

- **Sencha is in active development, so all APIs are subject to change.**
- **This code is unaudited. Use at your own risk.**

## Packages

| Package                | Description                                      | Version                                                                                                         | Docs                                                                                 |
| :--------------------- | :----------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| `cpamm`                | Constant product automated market maker.         | [![Crates.io](https://img.shields.io/crates/v/cpamm)](https://crates.io/crates/cpamm)                           | [![Docs.rs](https://docs.rs/cpamm/badge.svg)](https://docs.rs/cpamm)                 |
| `xyk`                  | Constant product AMM calculator used for Sencha. | [![Crates.io](https://img.shields.io/crates/v/xyk)](https://crates.io/crates/xyk)                               | [![Docs.rs](https://docs.rs/xyk/badge.svg)](https://docs.rs/xyk)                     |
| `@senchahq/sencha-sdk` | TypeScript SDK for Sencha                        | [![npm](https://img.shields.io/npm/v/@sencha/sencha-sdk.svg)](https://www.npmjs.com/package/@sencha/sencha-sdk) | [![Docs](https://img.shields.io/badge/docs-typedoc-blue)](https://docs.crate.so/ts/) |

## Addresses

Program addresses are the same on devnet, testnet, and mainnet-beta.

- CpAmm: [`SCHAtsf8mbjyjiv4LkhLKutTf6JnZAbdJKFkXQNMFHZ`](https://explorer.solana.com/address/SCHAtsf8mbjyjiv4LkhLKutTf6JnZAbdJKFkXQNMFHZ)

## Developing

```bash
# Setup
yarn install
yarn idl:generate
anchor build

# Testing
yarn test:e2e

# Building SDK
yarn build
```

## Contribution

Thank you for your interest in contributing to Sencha Protocol! All contributions are welcome no matter how big or small. This includes (but is not limited to) filing issues, adding documentation, fixing bugs, creating examples, and implementing features.

When contributing, please make sure your code adheres to some basic coding guidelines:

- Code must be formatted with the configured formatters (e.g. rustfmt and prettier).
- Comment lines should be no longer than 80 characters and written with proper grammar and punctuation.
- Commit messages should be prefixed with the package(s) they modify. Changes affecting multiple packages should list all packages. In rare cases, changes may omit the package name prefix.

## License

Sencha Protocol is licensed under the AGPL-3.0 license.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in Sencha Protocol by you, as defined in the AGPL-3.0 license, shall be licensed as above, without any additional terms or conditions.
