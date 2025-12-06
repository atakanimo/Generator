You are an expert Senior Full Stack Developer specialized in Electron, React, and TypeScript. We are building a "Universal Code Generator" desktop application.

#Phase 1

Current Stack: Electron + Vite + React + TypeScript.

Task: Initialize the project architecture using Material UI (MUI) and Redux Toolkit.

1. Clean up the default boilerplate code (remove standard logos, demo text, css files).
2. Install and configure 'Material UI' (@mui/material, @emotion/react, @emotion/styled) and '@mui/icons-material'.
3. Set up a 'Dark Theme' provider using MUI's `createTheme` and `CssBaseline`. Make Dark Mode the default.
4. State Management Setup:
   - Install '@reduxjs/toolkit' and 'react-redux'.
   - Create a `src/renderer/src/store` folder.
   - Set up the main `store.ts` and create a clear pattern for 'slices' (e.g., create a `appSlice.ts` for general app settings to start with).
   - Wrap the App in the Redux `<Provider>`.
5. Set up a clear folder structure in `src/renderer`:
   - /components (Reusable UI components)
   - /pages (Views/Screens)
   - /features (For Redux slices and related logic)
   - /types (Shared interfaces)
6. Ensure the IPC (Inter-Process Communication) bridge in `src/preload/index.ts` is typed correctly to support future database connection commands.

Goal: A clean, compiling "Hello World" screen with Material UI Dark Theme active and Redux Store connected (verify with a simple console log or Redux DevTools), ready for UI development.