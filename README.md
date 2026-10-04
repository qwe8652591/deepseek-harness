# DeepSeek Harness

English | [中文](README.zh.md)

## Aiko source repository

This private repository maintains the Aiko/云遥 Host and desktop integration derived from [DeepSeek's official Harness](https://github.com/deepseek-ai/deepseek-harness). The [DSH 0.2 integration branch](https://github.com/aiko-dsh-plugins/deepseek-harness-source/tree/codex/aiko-desktop-020) owns the current desktop product work; this default branch carries an older development line. Business plugins and product profiles belong to [Aiko Workbench](https://github.com/aiko-dsh-plugins/aiko-dsh-workbench), while platform identity and business APIs belong to [Yunyao Workspace](https://github.com/aiko-dsh-plugins/yunyao-office-site). See the [repository map](https://github.com/aiko-dsh-plugins/aiko-dsh-workbench/blob/main/docs/repository-map.md) for release ownership.

`apps/desktop` contains the desktop application, `packages/` contains Harness plugins, and `vendor/` contains pinned upstream dependencies. Follow the selected branch's development guide to build and check its Host and desktop artifacts. The npm command below installs the official package; it does not install this private product build. Fork changes are maintained by Aiko and are not statements about official DeepSeek support.

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
