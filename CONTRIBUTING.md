# Contributing

Thanks for contributing to Ping-Pong Trail Studio.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

## Project Areas

- `index.html` + `src/main.js`: full Studio editor
- `player.html` + `src/player.js`: Lean Player for playback/fullscreen
- `src/settings.js`: shared settings JSON schema and sanitization
- `src/*-utils.js`: reusable color/image/motion utilities

## Before Opening a PR

Run:

```bash
npm run build
```

Your PR should include:

- Clear summary of what changed
- Why it changed
- Screenshots or short video for UI changes
- Notes about any behavior changes to Studio or Lean Player

## Coding Guidelines

- Keep modules focused and small.
- Prefer extending existing utility modules over duplicating logic.
- Keep settings compatibility stable (`src/settings.js`).
- Avoid breaking exported JSON payload shape unless versioned.

## Pull Request Scope

- Small and focused PRs are easier to review.
- Separate refactors from behavior changes when possible.
- Include migration notes if a change affects saved settings JSON.

## Reporting Bugs

Please include:

- Browser and OS version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)
- Example image/settings JSON when relevant

## Security

Do not open public issues for sensitive security vulnerabilities.
Instead, contact the maintainer directly.
