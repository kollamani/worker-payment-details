/*
 * Regression smoke test for the Task Notes "Edit Task Note" modal.
 *
 * It locks in the two bugs that made the dialog render as an empty screen:
 *
 *   1. STACKING - the backdrop used to be a separate `absolute z-10` sibling
 *      next to a `relative` (z-index: auto) <form>. CSS paints positive
 *      z-index positioned descendants last, so the backdrop covered the whole
 *      form: a dark, blurred, non-interactive void.
 *   2. SUBMIT CONTRACT - the form used to call `onSubmit(form)` (the draft)
 *      while the page's handler called `event.preventDefault()`. That threw
 *      `preventDefault is not a function`, and because the REAL DOM event was
 *      never prevented the browser ran a native form submit -> full page
 *      reload -> the "empty screen".
 *
 * The real component is bundled (JSX + imports exactly as the app builds them)
 * and server-rendered, with the JSX runtime redirected to a capture shim so the
 * live props and handlers can be driven directly.
 *
 * Run: node scripts/smoke-edit-task-note-modal.mjs   (from the frontend folder)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToString } from 'react-dom/server';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const MODAL_PATH = path.join(root, 'src', 'components', 'tasknotes', 'EditTaskNoteModal.jsx');
const BUNDLE_PATH = path.join(root, 'node_modules', '.smoke-edit-task-note-modal.cjs');
const CAPTURE_KEY = '__capturedEditTaskNoteModalJsx';

/** Redirects the automatic JSX runtime to a recorder that keeps every element. */
const captureJsxRuntime = {
  name: 'capture-jsx-runtime',
  setup(build) {
    // The capture shim's own require must fall through to the real runtime.
    build.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, (args) =>
      args.namespace === 'capture' ? null : { path: 'jsx-runtime-capture', namespace: 'capture' }
    );
    build.onLoad({ filter: /.*/, namespace: 'capture' }, () => ({
      loader: 'js',
      contents: `
        // The full runtime signature (type, props, key, isStaticChildren, ...)
        // is forwarded untouched, so React's dev validation still runs.
        const runtime = require('react/jsx-dev-runtime');
        const captured = (globalThis.${CAPTURE_KEY} = []);
        const record = (create) => (...args) => {
          const element = create(...args);
          captured.push(element);
          return element;
        };
        exports.Fragment = runtime.Fragment;
        exports.jsx = record(runtime.jsx);
        exports.jsxs = record(runtime.jsxs);
        exports.jsxDEV = record(runtime.jsxDEV);
      `,
    }));
  },
};

const failures = [];
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures.push(detail ? `${label} (${detail})` : label);
};

/** Concatenated text content of an element subtree (for exact label checks). */
const textOf = (element) => {
  const collect = (children) => {
    const list = Array.isArray(children) ? children : [children];
    return list
      .map((child) => {
        if (child === null || child === undefined || typeof child === 'boolean') return '';
        if (React.isValidElement(child)) return collect(child.props?.children);
        return String(child);
      })
      .join('');
  }
  return collect(element?.props?.children);
};

const cleanup = () => fs.rmSync(BUNDLE_PATH, { force: true });

try {
  await esbuild.build({
    stdin: {
      contents: `export { default as EditTaskNoteModal } from ${JSON.stringify(MODAL_PATH)};`,
      resolveDir: root,
      sourcefile: 'smoke-entry.js',
      loader: 'js',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    jsxDev: true,
    // React stays external so the component's hooks share this renderer.
    external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    plugins: [captureJsxRuntime],
    outfile: BUNDLE_PATH,
    logLevel: 'silent',
  });

  const { EditTaskNoteModal } = require(BUNDLE_PATH);
  const captured = globalThis[CAPTURE_KEY];

  const DRAFT = {
    description: 'Collect rent from Sharma',
    note: 'Ask for the receipt',
    presentAmount: 4500,
    category: 'PRESENT_HAVING',
  };

  /** Renders the modal and returns the fresh element list plus lookup helpers. */
  const render = (props) => {
    captured.length = 0;
    const html = renderToString(React.createElement(EditTaskNoteModal, props));
    const propsOf = (predicate) =>
      captured.find((element) => element.props && predicate(element.props))?.props;
    return {
      html,
      propsOf,
      fieldByLabel: (label) => propsOf((props) => props['aria-label'] === label),
      form: propsOf((props) => props.onSubmit !== undefined),
      dialog: propsOf((props) => props.role === 'dialog'),
    };
  };

  let submitted = null;
  const onSubmit = (value) => {
    submitted = value;
  };
  const baseProps = { form: DRAFT, onChange: () => {}, onCategoryChange: () => {}, onSubmit, onCancel: () => {} };
  // ── 1. REGRESSION: stacking order ──────────────────────────────────────────
  const { html, dialog, form } = render(baseProps);

  // The old bug shipped a self-closing `absolute ... z-10` backdrop sibling.
  const rogueBackdrop = captured.find((element) => {
    const className = element.props?.className;
    return typeof className === 'string' && className.includes('absolute') && /(^|\s)z-10(\s|$)/.test(className);
  });
  check(
    'no `absolute z-10` backdrop sibling that could cover the form',
    !rogueBackdrop,
    rogueBackdrop?.props?.className
  );

  // The overlay now lives on the dialog container itself and the form is its
  // only child, so no sibling can compete for the top paint layer.
  check(
    'overlay styles live on the dialog container',
    typeof dialog?.className === 'string' &&
      dialog.className.includes('fixed') &&
      dialog.className.includes('inset-0') &&
      dialog.className.includes('backdrop-blur-md')
  );
  check(
    "the form is the dialog container's only child (nothing can cover it)",
    React.isValidElement(dialog?.children) && dialog.children.type === 'form'
  );
  check(
    'the panel is a positioned box, not an unpainted overlay layer',
    typeof form?.className === 'string' && form.className.includes('relative')
  );
  check('markup contains exactly one <form>', (html.match(/<form/g) || []).length === 1);

  // ── 2. REGRESSION: submit contract ────────────────────────────────────────
  check('submit is routed through the modal wrapper', typeof form?.onSubmit === 'function');

  // A synthetic submit event, exactly what the browser hands to onSubmit.
  let prevented = 0;
  let stopped = 0;
  const fakeEvent = {
    preventDefault: () => {
      prevented += 1;
    },
    stopPropagation: () => {
      stopped += 1;
    },
  };
  submitted = null;
  form.onSubmit(fakeEvent);

  check(
    'the real submit event is preventDefault()-ed (no native form navigation)',
    prevented === 1,
    `prevented=${prevented}`
  );
  check('propagation is stopped so the overlay click-away handler stays quiet', stopped === 1);
  check(
    'onSubmit receives the EVENT, not the draft object',
    submitted === fakeEvent,
    `received=${Object.prototype.toString.call(submitted)}`
  );
  check(
    'onSubmit is never handed the form draft (the old bug)',
    submitted !== baseProps.form && !(submitted && submitted.description === DRAFT.description)
  );

  // ── 3. Prefill ────────────────────────────────────────────────────────────
  const prefilled = render(baseProps);
  check(
    'description is pre-filled from the task',
    prefilled.fieldByLabel('Task description')?.value === DRAFT.description
  );
  check('notes are pre-filled', prefilled.fieldByLabel('Task notes')?.value === DRAFT.note);
  check('amount is pre-filled', prefilled.fieldByLabel('Present amount')?.value === DRAFT.presentAmount);
  check('category is pre-filled', prefilled.fieldByLabel('Task category')?.value === DRAFT.category);
  check(
    'every pre-filled field is CONTROLLED (value is never undefined/null)',
    ['Task description', 'Task notes', 'Present amount', 'Task category'].every((label) => {
      const value = prefilled.fieldByLabel(label)?.value;
      return value !== undefined && value !== null;
    })
  );

  // ── 4. Fallback UI for missing / partial data ─────────────────────────────
  const missing = render({ ...baseProps, form: undefined });
  check(
    'a missing draft renders a readable fallback, not a void',
    textOf({ props: missing.dialog }).includes('Task unavailable')
  );
  check('the fallback exposes no empty <form>', !missing.html.includes('<form'));
  check(
    'the fallback is announced to assistive tech',
    missing.propsOf((props) => props.role === 'alert') !== undefined
  );

  // A partial draft must still render controlled (never `undefined`) inputs.
  const partial = render({ ...baseProps, form: { description: 'Only a title' } });
  check(
    'a partial draft still renders string-valued inputs',
    partial.fieldByLabel('Task description')?.value === 'Only a title' &&
      partial.fieldByLabel('Task notes')?.value === '' &&
      partial.fieldByLabel('Present amount')?.value === ''
  );
  check(
    'a missing category falls back to the default instead of an unselected select',
    partial.fieldByLabel('Task category')?.value === 'PRESENT_HAVING'
  );

  // ── 5. In-flight state ────────────────────────────────────────────────────
  const busy = render({ ...baseProps, saving: true, error: 'Present amount must be a valid non-negative number.' });
  const submitButton = busy.propsOf((props) => props.type === 'submit');
  check('Save is disabled while saving', submitButton?.disabled === true);
  check('Save is aria-busy while saving', submitButton?.['aria-busy'] === true);
  check(
    'a second submit while in flight does not re-fire the handler',
    (() => {
      submitted = null;
      busy.form.onSubmit({ preventDefault() {}, stopPropagation() {} });
      return submitted === null;
    })()
  );
  check(
    'validation / API errors render inside the dialog',
    textOf({ props: busy.dialog }).includes('Present amount must be a valid non-negative number.') &&
      busy.html.includes('role="alert"')
  );

  console.log('');
  console.log(
    failures.length === 0
      ? 'SMOKE PASS — all Edit Task Note modal checks passed.'
      : `SMOKE FAIL — ${failures.length} check(s) failed:`
  );
  failures.forEach((failure) => console.log(`  - ${failure}`));
  cleanup();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log('SMOKE THREW:');
  console.log((error && error.stack) || String(error));
  cleanup();
  process.exit(1);
}
