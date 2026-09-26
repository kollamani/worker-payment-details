/*
 * Smoke test for the Task Notes "Create Task Note" modal.
 *
 * Three layers of verification, all dependency-free (no jsdom / jest needed):
 *   1. DOM contract — the real component is bundled (JSX + imports exactly as
 *      the app builds them) and server-rendered, then the emitted HTML is
 *      asserted: dialog semantics, title, counter, footer breakdown and the
 *      royal-ledger styling hooks.
 *   2. Element tree — the same bundle redirects its JSX runtime to a capture
 *      shim, so the live props and handlers can be inspected during the render:
 *      every field must be controlled, the priority pills must form a radio
 *      group with exactly one checked value, and the X button + backdrop +
 *      Cancel must route through the modal's own handleClose (draft-resetting)
 *      path instead of the raw onClose prop.
 *   3. Module contract — the exported draft factory / priority ladder and the
 *      real `/members` fetch target, which a server render cannot observe
 *      because effects never run.
 *
 * Run: node scripts/smoke-create-task-modal.mjs   (from the frontend folder)
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
const MODAL_PATH = path.join(root, 'src', 'components', 'tasknotes', 'CreateTaskModal.jsx');
const BUNDLE_PATH = path.join(root, 'node_modules', '.smoke-create-task-modal.cjs');
const CAPTURE_KEY = '__capturedCreateTaskModalJsx';

/**
 * The component pulls in the app's axios instance for the "Assign to" dropdown.
 * Server rendering never runs effects, so a never-resolving stub keeps the
 * network out of the test while the component tree stays the real one.
 */
const stubApiClient = {
  name: 'stub-api-client',
  setup(build) {
    build.onResolve({ filter: /api[\\/]axios$/ }, () => ({ path: 'api-stub', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      loader: 'js',
      contents: `
        const pending = () => new Promise(() => {});
        const api = { get: pending, post: pending, put: pending, delete: pending };
        export default api;
      `,
    }));
  },
};

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

/** Flattens an element subtree into the list of captured React elements. */
const flatten = (children) => {
  const list = Array.isArray(children) ? children : [children];
  return list.flatMap((child) =>
    React.isValidElement(child) ? [child, ...flatten(child.props?.children)] : []
  );
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
  };
  return collect(element?.props?.children);
};

const cleanup = () => fs.rmSync(BUNDLE_PATH, { force: true });

try {
  await esbuild.build({
    stdin: {
      contents: `export { default as CreateTaskModal, createEmptyDraft, PRIORITY_OPTIONS, memberDisplayName } from ${JSON.stringify(MODAL_PATH)};`,
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
    plugins: [stubApiClient, captureJsxRuntime],
    outfile: BUNDLE_PATH,
    logLevel: 'silent',
  });

  const {
    CreateTaskModal,
    createEmptyDraft,
    PRIORITY_OPTIONS,
    memberDisplayName,
  } = require(BUNDLE_PATH);

  const onClose = () => {};
  const onSubmit = async () => false;
  const captured = globalThis[CAPTURE_KEY];
  captured.length = 0;

  const html = renderToString(
    React.createElement(CreateTaskModal, { open: true, onClose, onSubmit })
  );
  const propsOf = (predicate) =>
    captured.find((element) => element.props && predicate(element.props))?.props;
  const fieldByLabel = (label) => propsOf((props) => props['aria-label'] === label);
  const buttons = captured.filter((element) => element.type === 'button');

  // ── 1. Dialog shell ───────────────────────────────────────────────────────
  const dialogProps = propsOf((props) => props.role === 'dialog');
  check('renders an accessible modal dialog', Boolean(dialogProps) && dialogProps['aria-modal'] === 'true');
  check(
    'dialog is labelled by its title and described by its subtitle',
    typeof dialogProps?.['aria-labelledby'] === 'string' &&
      typeof dialogProps?.['aria-describedby'] === 'string'
  );
  const titleProps = propsOf((props) => props.id === dialogProps?.['aria-labelledby']);
  check('title reads "Create Task Note"', textOf({ props: titleProps }) === 'Create Task Note');

  const backdropElement = captured.find((element) =>
    element.props?.className?.includes('backdrop-blur-md')
  );
  const backdrop = backdropElement?.props;
  check('backdrop is marked decorative for screen readers', backdrop?.['aria-hidden'] === 'true');
  check(
    'backdrop click closes the dialog through handleClose',
    typeof backdrop?.onClick === 'function' && backdrop.onClick !== onClose
  );
  check('backdrop sits on z-0 below the card', typeof backdrop?.className === 'string' && backdrop.className.includes('z-0'));

  const formElement = captured.find((element) => element.props?.id?.endsWith('-form'));
  const form = formElement?.props;
  check(
    'card is a sibling of the backdrop, never its child',
    Boolean(formElement && backdropElement) && !flatten(formElement.props.children).includes(backdropElement)
  );
  check(
    'card is a rounded marble panel on z-10',
    form?.className?.includes('z-10') === true &&
      form?.className?.includes('rounded-[26px]') === true &&
      form?.className?.includes('border-white/70') === true
  );
  check(
    'submit is routed through the modal submit wrapper',
    typeof form?.onSubmit === 'function' && form.onSubmit !== onSubmit
  );
  check(
    'X button routes through handleClose (draft reset), not raw onClose',
    (() => {
      const closeButton = propsOf((props) => props['aria-label'] === 'Close dialog');
      return typeof closeButton?.onClick === 'function' && closeButton.onClick !== onClose;
    })()
  );

  // ── 2. Ornaments ──────────────────────────────────────────────────────────
  const crest = captured.find((element) => element.props?.viewBox === '0 0 48 56');
  check('header shows the silver shield crest', Boolean(crest) && crest.props['aria-hidden'] === 'true');
  const gradients = flatten(crest?.props.children).filter((element) => element.type === 'linearGradient');
  check(
    'crest defines the silver + royal-blue gradients',
    gradients.length === 2 &&
      String(gradients[0].props.id).endsWith('-silver') &&
      String(gradients[1].props.id).endsWith('-blue'),
    JSON.stringify(gradients.map((gradient) => gradient.props.id))
  );
  check(
    'crest gradient ids are selector-safe (no useId punctuation)',
    gradients.length === 2 && !gradients.some((gradient) => /[:%]/.test(String(gradient.props.id)))
  );
  const filigree = captured.filter((element) => element.props?.viewBox === '0 0 72 72');
  check(
    'four silver filigree corners frame the card',
    filigree.length === 4 && filigree.every((element) => element.props['aria-hidden'] === 'true')
  );

  // ── 3. Priority pills ─────────────────────────────────────────────────────
  const priorityGroup = propsOf(
    (props) => props.role === 'radiogroup' && props['aria-label'] === 'Priority'
  );
  const priorityPills = captured.filter((element) => element.props?.role === 'radio');
  check('priority pills form a labelled radio group', Boolean(priorityGroup) && priorityPills.length === 4);
  check(
    'priority options match the exported ladder',
    priorityPills.map((element) => element.props['aria-label']).join('|') ===
      PRIORITY_OPTIONS.map((option) => `${option.label} priority`).join('|'),
    JSON.stringify(priorityPills.map((element) => element.props['aria-label']))
  );
  const checkedPills = priorityPills.filter((element) => element.props['aria-checked'] === true);
  check(
    'exactly one pill is checked and it is Medium',
    checkedPills.length === 1 && checkedPills[0]?.props['aria-label'] === 'Medium priority'
  );
  check(
    'every pill is a non-submitting button with its own handler',
    priorityPills.every(
      (element) => element.props.type === 'button' && typeof element.props.onClick === 'function'
    )
  );
  check(
    'the selected pill carries its neon aura',
    checkedPills[0]?.props.className.includes('shadow-[0_0_22px_rgba(34,211,238,0.55)]') === true &&
      PRIORITY_OPTIONS[1]?.iconClass === 'text-cyan-500'
  );

  // ── 4. Fields ─────────────────────────────────────────────────────────────
  const description = fieldByLabel('Task description');
  const note = fieldByLabel('Task note (optional)');
  const category = fieldByLabel('Task category');
  const amount = fieldByLabel('Amount');
  const assignee = fieldByLabel('Assign to team member');
  const reminderInput = fieldByLabel('Reminder date and time');

  check(
    'every visible field is controlled with an onChange handler',
    [description, note, category, amount, assignee].every(
      (props) => props && typeof props.onChange === 'function' && typeof props.value === 'string'
    )
  );
  check(
    'task description keeps the required + placeholder contract',
    description?.required === true &&
      description?.placeholder === 'e.g. Pay the electrician for site work'
  );
  check(
    'note textarea stays bound to state with a 2000 ceiling',
    note?.value === '' && note?.maxLength === 2000 && note?.rows === 3
  );
  check('note supports the Ctrl/Cmd markdown shortcuts', typeof note?.onKeyDown === 'function');
  check(
    'amount declares numeric guard rails',
    amount?.type === 'number' &&
      amount?.required === true &&
      amount?.min === '0' &&
      amount?.step === '0.01' &&
      amount?.inputMode === 'decimal'
  );
  check(
    'category select defaults to the default category',
    category?.value === 'PRESENT_HAVING' && category?.children?.length === 4
  );
  check(
    'assignee select offers the "Select Team Member" placeholder first',
    assignee?.value === '' &&
      assignee?.children?.[0]?.props?.value === '' &&
      assignee.children[0].props.children === 'Select Team Member'
  );
  check(
    'the reminder picker stays collapsed until the button is used',
    reminderInput === undefined && !html.includes('datetime-local')
  );
  check('amount field is annotated as a required field', html.includes('Required field'));

  // ── 5. Note toolbar + counter ─────────────────────────────────────────────
  const toolbarButtons = buttons.filter((element) => /^Insert /.test(String(element.props?.['aria-label'])));
  check('note header exposes the mini rich-text toolbar', toolbarButtons.length === 3);
  check(
    'toolbar exposes bold / italic / list in order',
    toolbarButtons.map((element) => element.props['aria-label']).join('|') ===
      'Insert bold|Insert italic|Insert bulleted list',
    JSON.stringify(toolbarButtons.map((element) => element.props['aria-label']))
  );
  check(
    'toolbar buttons never submit the form',
    toolbarButtons.every(
      (element) => element.props.type === 'button' && typeof element.props.onClick === 'function'
    )
  );
  const counterProps = propsOf(
    (props) => typeof props.className === 'string' && props.className.includes('tabular-nums text-slate-400')
  );
  check(
    'note counter starts at (0/2000)',
    textOf({ props: counterProps }) === '(0/2000)',
    JSON.stringify(textOf({ props: counterProps }))
  );

  // ── 6. Assign to + reminder ───────────────────────────────────────────────
  const reminderButton = buttons.find((element) => textOf(element).includes('Set Reminder'))?.props;
  check(
    'Set Reminder is a collapsed ornate toggle',
    Boolean(reminderButton) &&
      reminderButton?.type === 'button' &&
      reminderButton?.['aria-expanded'] === false &&
      typeof reminderButton?.['aria-controls'] === 'string'
  );
  check(
    'Set Reminder wears the dark royal-blue gradient',
    reminderButton?.className.includes('from-brand-600') === true &&
      reminderButton?.className.includes('to-blue-800') === true
  );
  check(
    'the selects carry the diamond marker',
    html.includes('rotate-45') && html.includes('border-b-2')
  );

  // ── 7. Footer ─────────────────────────────────────────────────────────────
  const footerProps = propsOf(
    (props) => typeof props.className === 'string' && props.className.includes('border-slate-200/80')
  );
  const footerText = textOf({ props: footerProps });
  const cancelButton = buttons.find((element) => element.props?.children === 'Cancel')?.props;
  const submitButton = buttons.find((element) => element.props?.type === 'submit')?.props;
  check(
    'footer shows the estimation breakdown',
    footerText.includes('Total amount (Est.)') && footerText.includes('Total: ₹0.00'),
    JSON.stringify(footerText)
  );
  check(
    'cancel closes through handleClose',
    cancelButton?.type === 'button' &&
      typeof cancelButton?.onClick === 'function' &&
      cancelButton.onClick !== onClose
  );
  check(
    'primary button submits and is enabled at rest',
    submitButton?.type === 'submit' &&
      submitButton?.disabled === false &&
      submitButton?.['aria-busy'] === false
  );
  check(
    'primary CTA reads "Add Task" with the sparkle + rune glow',
    textOf({ props: submitButton }).includes('Add Task') &&
      html.includes('animate-rune-glow') &&
      html.includes('✦')
  );
  check(
    'only the primary button is a submitter',
    buttons.filter((element) => element.props?.type === 'submit').length === 1
  );

  // ── 8. Closed state + module contract ─────────────────────────────────────
  captured.length = 0;
  const closedHtml = renderToString(
    React.createElement(CreateTaskModal, { open: false, onClose, onSubmit })
  );
  check(
    'renders nothing when closed',
    closedHtml === '' && captured.length === 0,
    `html=${JSON.stringify(closedHtml)}`
  );

  const draft = createEmptyDraft();
  check(
    'draft factory carries all seven composer fields',
    Object.keys(draft).sort().join(',') ===
      'assignedTo,category,description,note,presentAmount,priority,reminderAt' &&
      draft.category === 'PRESENT_HAVING' &&
      draft.priority === 'MEDIUM' &&
      draft.assignedTo === '' &&
      draft.reminderAt === ''
  );
  check(
    'member labels fall back through the legacy keys',
    memberDisplayName({ name: 'Legacy Worker' }) === 'Legacy Worker' &&
      memberDisplayName({ jNo: 'J-9' }) === 'J-9' &&
      memberDisplayName({}) === 'Team member'
  );
  const source = fs.readFileSync(MODAL_PATH, 'utf8');
  check(
    'assignee dropdown loads the real /members endpoint',
    /api\s*\.\s*get\(\s*'\/members'\s*\)/.test(source)
  );

  console.log('');
  console.log(
    failures.length === 0
      ? 'SMOKE PASS — all Create Task Note modal checks passed.'
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

