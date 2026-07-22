# Unified Comms

A desktop app built with **Next.js + Electron** for unifying messaging services into a single desktop workspace.

## Key features

- Electron-hosted desktop shell with a custom titlebar and sidebar
- Multiple service views using Electron `WebContentsView`
- Service sidebar with drag/drop ordering, groups, and context menus
- Persistent settings and service data via `electron-store`
- Notification badges, toasts, and badge suppression
- Backup/restore and junk userdata scanning
- Packaged app builds for Windows, macOS, and Linux

## Project structure

- `electron/`
  - `main.js` — Electron main process, view management, IPC bridge, notifications, license handling
  - `preload.js` — exposes safe `electronAPI` to the renderer
  - `toast.html` — in-app toast renderer
- `src/`
  - `app/` — Next.js app entry points
  - `components/` — UI components for titlebar, sidebar, content area, modals, and notifications
  - `hooks/` — custom renderer hooks
  - `store/` — global state using React context and reducer
  - `types/` — shared TypeScript types
- `assets/` — icon and static asset sources
- `public/` — public assets served by Next.js
- `scripts/` — custom scripts for development, build, and startup

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This runs both the Next.js development server and Electron.

## Build

```bash
npm run build
npm start
```

## Package

```bash
npm run dist
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## Notes

- The renderer UI is a Next.js client app that uses Electron IPC to manage services and application state.
- Service web views are loaded in separate Electron partitions to preserve sessions per service.
- `electron-store` persists settings and user service configuration.

## License

This repository is private.
