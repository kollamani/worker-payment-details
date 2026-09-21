/*
 * SSR smoke test for the Task Notes page.
 *
 * Runs through Vite's ssrLoadModule so JSX + alias imports resolve exactly
 * like the dev server, and mounts the page inside the same providers the
 * real app uses (BrowserRouter, AuthProvider, ToastProvider).
 *
 * Run: node scripts/smoke-ssr.mjs  (from the frontend folder)
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const vite = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const [page, auth, toast, router] = await Promise.all([
    vite.ssrLoadModule('/src/pages/TaskNotes.jsx'),
    vite.ssrLoadModule('/src/context/AuthContext.jsx'),
    vite.ssrLoadModule('/src/context/ToastContext.jsx'),
    vite.ssrLoadModule('react-router-dom'),
  ]);

  const TaskNotes = page.default;
  if (typeof TaskNotes !== 'function') {
    console.error('SMOKE FAIL: TaskNotes default export is not a component:', typeof TaskNotes);
    process.exitCode = 1;
  } else {
    const tree = React.createElement(
      router.MemoryRouter,
      null,
      React.createElement(
        auth.AuthProvider,
        null,
        React.createElement(toast.ToastProvider, null, React.createElement(TaskNotes))
      )
    );
    const html = renderToString(tree);
    const hasCards = html.includes('Current Savings') && html.includes('Planned Income');
    console.log('SSR render completed without throwing.');
    console.log('HTML length:', html.length, '| summary cards rendered:', hasCards);
  }
} catch (err) {
  console.log('SSR THREW:');
  console.log((err && err.stack) || String(err));
  process.exitCode = 1;
} finally {
  await vite.close();
}

