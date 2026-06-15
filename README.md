# Universal Code Generator

A desktop application built with Electron, React, TypeScript, Material UI, and Redux Toolkit.

## Tech Stack

- **Electron** - Desktop application framework
- **Vite** - Build tool and dev server
- **React** - UI library
- **TypeScript** - Type safety
- **Material UI (MUI)** - Component library with Dark Theme
- **Redux Toolkit** - State management

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Run the development server:

```bash
npm run electron:dev
```

This will:
1. Start the Vite dev server on http://localhost:5190
2. Launch Electron when the server is ready

### Build

Build for production:

```bash
npm run electron:build
```

## Project Structure

```
src/
├── main/              # Electron main process
├── preload/           # Preload scripts (IPC bridge)
└── renderer/          # React application
    └── src/
        ├── components/    # Reusable UI components
        ├── pages/        # Views/Screens
        ├── features/     # Redux slices and related logic
        ├── types/        # Shared TypeScript interfaces
        ├── store/        # Redux store configuration
        └── theme.ts      # MUI theme configuration
```

## Features

- ✅ Dark Theme (default)
- ✅ Redux Toolkit state management
- ✅ TypeScript throughout
- ✅ Typed IPC bridge for Electron communication

