# Contributing

Thanks for your interest in contributing to micro-visor.

## Development setup

1. Install Node.js 22+.
2. Install dependencies:

```bash
npm install
```

3. Run checks:

```bash
npm run lint
npm run typecheck
npm run build
npm run format:check
```

## Branch and commit

- Create feature branch from `main`.
- Keep changes focused and small.
- Use clear commit messages, for example:
  - `feat(signaling): add session heartbeat`
  - `fix(agent): guard disconnect before socket open`
  - `docs: clarify local run instructions`

## Pull request checklist

- [ ] Lint, typecheck, and build pass locally
- [ ] README or docs updated when behavior changes
- [ ] No secrets or credentials committed
- [ ] Scope is focused and explained in PR description

## Reporting bugs

Please use the Bug Report issue template and include:

- Environment (OS, Node version)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs
