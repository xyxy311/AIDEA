# AIDEA

A brainstorming whiteboard with AI capabilities: express ideas with nodes and connections, organize and nest thoughts on a canvas, and have AI help you diverge.

- Tech stack: Vue 3 + TypeScript + Electron
- Platform: A pure front-end web app; the production build is a single HTML file that can be opened directly in a browser. Data is stored locally (browser + project files).

## Feature Overview

AIDEA is still fairly crude, but the core features all work:

- **Canvas & nodes**: create, edit, delete, connect, nest, snap-to-grid, box-select; full undo/redo coverage (continuous edits on one property auto-coalesce, and compound operations are stored as a single history entry)
- **Inline & node views**: a node can expand into a nested sub-canvas inside the canvas (one level deep), or you can switch into a focused node view; multi-tab switching for quick access
- **Preset styles**: independent presets for nodes/connections with grouping & filtering, quick-apply via `1-9`
- **Customizable UI**: left activity bar + right multi-panel dock; panels can be drag-reordered, moved across sides, collapsed/closed; the top toolbar icon buttons are draggable too; layout changes persist and can be reset to default with one click
- **Grid mode**: snap nodes to the grid and do common operations with keyboard only
- **Node search**: search by text and jump to the result
- **Tag system**: project-level tag definitions, tag nodes, and use tags as search filters
- **Node references**: define a reference name with `#name` and reference it with `@name` (accent-color highlight, autocomplete, click-to-jump)
- **AI divergence** (built-in plugin): builds context from the spatial layout of the current view/selection, calls a large model to generate words, and clicking a word adds it as a node
- **Files**: create, save, and load projects
- **Appearance**: light/dark themes; the UI supports 中文 / English (Settings → Appearance)
- **Plugin system**: features are registered through the plugin SDK (panels / toolbar buttons / settings sections / context menu / shortcuts / floating layer / modal), and the AI feature is itself implemented as a plugin

My skill and time are both limited, and most of the project was written by AI — my own direct edits are few, so the whole project may have a strong "AI flavor." That said, all the basic features work. If you'd like, feel free to extend the app yourself.

## Quick Start

```bash
# Requires Node.js 20+.
# Install dependencies
npm install

# Start the development server
npm run dev

# Build
npm run build

# Run
npx electron .

# Package (Windows-only for now)
npm run dist:win
# Produces an installer in the release/ directory (NSIS installer)
```

## Language

AIDEA currently carries Chinese (built-in) and English (as an external language pack). Switch via **Settings (gear icon) → Appearance → Language**.

To add a new language, see [Add Language](docs/追加语言.md).

### AI Setup

Enable the AI feature under **Settings → Plugins**, then reload. The AI feature is based on an OpenAI-compatible interface; configure a connection first:

1. Open **Settings (gear icon) → AI Settings**;
2. Fill in `baseURL`, `model`, `apiKey` (timeout & temperature are adjustable);
3. Select a node and press **`I`** to diverge directly, **`C`** to clear generated words; the AI panel also lets you adjust global/view prompts, divergence direction, and generation mode.

The connection config is stored in the app locally (not in project files); project-level prompts are saved with the project file.

## Where Data Is Stored

- **User config** (theme/accent/language/shortcuts/panel layout/preset styles/plugin on-off & config/recent files…): stored in the app's **user data directory** (Electron `userData`), pinned by `app.setName('AIDEA')` — on Windows that's `%APPDATA%\AIDEA\` (i.e. `C:\Users\<username>\AppData\Roaming\AIDEA`). It is **not** a folder under the repo root — please don't create a `userData` folder in the repo.
- **Project content**: kept in `.aidea.json` project files, at a path you choose via "Open / Save As"; it never touches the user data directory.

## Project Structure

```
AIDEA/
├─ electron/           Electron shell: main / preload / shared (IPC bridge, plugin protocol, seeding…)
├─ src/                Renderer layer (Vue 3 + TypeScript)
│   ├─ components/     canvas / toolbar / panels / layout / common components
│   ├─ composables/    command layer useCommands, useActiveView, useT…
│   ├─ stores/         pinia: node / tag / view / project / preset / history / theme…
│   ├─ config/         color schemes (light/dark + accent)
│   ├─ constants/      design tokens & catalogs (panel / toolbar button registration)
│   ├─ locales/        built-in Chinese UI strings
│   └─ utils/          pure functions
├─ plugins/            plugins (built-in AI plugin)
├─ i18n-runtime/       runtime language-pack directory (dev: `*.json` hot-registered)
├─ scripts/            build scripts (dev / build-electron / vendor…)
├─ build/              electron-builder resources (icon, NSIS script)
├─ docs/               architecture & usage docs
├─ public/             static assets
└─ test/               tests
```

The core architecture uses three layers: **interaction layer → command layer (`useCommands`) → data layer (stores)**. Every data write goes through `useCommands`, which captures old values, produces a `DataPatch`, and pushes it onto the history stack — the foundation of reliable undo/redo. See the docs under `docs/` for details.

## Documentation

The architecture and usage docs for each subsystem live in the [`docs/`](docs/) directory, including but not limited to:

- [Add Language](docs/追加语言.md): adding a new UI language
- [Feature Overview](docs/项目功能介绍.md): feature overview
- [Plugin Development Guide](docs/插件开发手册.md): plugin development guide

> Some docs are in Simplified Chinese. The reference titles above keep their original file names so the links stay valid.


## License

[MIT](LICENSE)

# Finally

I originally built this app just for my own use, and now I want to share it. But I have limited time and skill, and I don't plan to update it frequently going forward — though I'll keep shipping new features and bug fixes as I make them.