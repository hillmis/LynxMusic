# LynxMusic — A Casual Open Music Player

LynxMusic is an open-source frontend example of a local/online music player built with React, TypeScript and Vite. It aims to provide a smooth playback experience and flexible playlist management for both desktop and mobile web environments.

Main features

- Local and online song management and playback
- Playback queue, playlist management and favorites
- Download manager and offline playback support (environment-dependent)
- Mobile-first, lightweight UI built with Tailwind CSS
- Hook-based audio playback logic for easy reuse and extension

Tech stack

- Framework: React + TypeScript
- Bundler: Vite
- Styling: Tailwind CSS
- State & logic: custom hooks (see `hooks/`)
- Storage: IndexedDB / file system bridge (see `utils/db.ts` and `utils/fileSystem.ts`)

Project layout (summary)

- `components/`: reusable UI components (player bar, song item, modals, etc.)
- `hooks/`: custom hooks such as audio player and song actions
- `pages/`: route components for Home, Playlist, Now Playing, Settings, etc.
- `utils/`: utilities and business logic (api, db, download manager, native bridge)
- Entry and config files: `index.html`, `index.tsx`, `App.tsx`, `vite.config.ts`, `package.json`

Quick start

1. Clone the repository

```bash
git clone <repo-url>
cd Lynxmusic
```

2. Install dependencies (Node.js required)

```bash
npm install
```

3. Start development server

```bash
npm run dev
```

4. Build for production

```bash
npm run build
```

5. Preview build

```bash
npm run preview
```

Development notes

- Entry files: `index.tsx` and `App.tsx`.
- Pages live under `pages/`, components under `components/`.
- Audio playback logic is centralized in `hooks/useAudioPlayer.ts` — read it to understand queueing, progress and events.
- Native or filesystem interactions are implemented in `utils/nativeBridge.ts`, `utils/fileSystem.ts`, and `utils/downloadManager.ts` and may require specific permissions or runtime contexts.

Testing & quality

- This repo currently does not include automated tests. Add unit tests for core logic and consider adding lint / format scripts for consistency.

Contributing

- Fork the repo and open PRs. Use feature branches and include a clear description of changes.
- Run `npm run build` before submitting a PR to ensure there are no build errors.

License

- See the `LICENSE` file in the repository root for license details.

FAQ

- Q: How to add local songs?
  A: Local songs are supported via browser file selection or native bridge in containerized/native environments. See `utils/fileSystem.ts` for implementation details.
- Q: Does the download manager support resume/partial downloads?
  A: See `utils/downloadManager.ts`; resume support depends on backend support and implementation.

More information
For implementation details, inspect `components/`, `hooks/`, and `utils/` in the source tree.
