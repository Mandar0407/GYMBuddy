import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
let dom;
let vite;
let cacheDir;
let createRoot;
let Calendar;
let Spinner;
let root;
let container;
const originalGlobals = new Map();

before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window.SVGElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  ({ createRoot } = await import("react-dom/client"));
  cacheDir = await mkdtemp(path.join(tmpdir(), "sandbox-ui-tests-"));
  // Load the actual TSX with the sandbox alias, without preview plugins,
  // environment variables, a listening server, or a browser dependency.
  vite = await createServer({
    configFile: false,
    root: packageRoot,
    cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": `${packageRoot}src` } },
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  ({ Calendar } = await vite.ssrLoadModule("/src/components/ui/calendar.tsx"));
  ({ Spinner } = await vite.ssrLoadModule("/src/components/ui/spinner.tsx"));
});

afterEach(async () => {
  if (root) {
    await React.act(() => root.unmount());
    root = undefined;
  }
  container?.remove();
});

after(async () => {
  await vite?.close();
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  dom?.window.close();
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

async function mount(element) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await React.act(() => root.render(element));
}

async function unmount() {
  await React.act(() => root.unmount());
  root = undefined;
}

// Calendar is a hook-free wrapper. Extract its real default Root so custom
// library refs can be exercised through React's actual DOM ref lifecycle,
// rather than mocking DayPicker or calling the bridging ref by hand.
function calendarRoot(props) {
  const Root = Calendar({}).props.components.Root;
  return React.createElement(Root, props);
}

test("calendar root assigns an object ref and clears it on unmount", async () => {
  const ref = React.createRef();
  await mount(calendarRoot({
    rootRef: ref,
    className: "calendar-custom",
    "aria-label": "Workout dates",
    children: "Calendar content",
  }));
  const node = container.querySelector('[data-slot="calendar"]');
  assert.ok(node instanceof HTMLElement);
  assert.equal(ref.current, node);
  assert.ok(node.classList.contains("calendar-custom"));
  assert.equal(node.getAttribute("aria-label"), "Workout dates");
  assert.equal(node.textContent, "Calendar content");
  await unmount();
  assert.equal(ref.current, null);
});

test("calendar callback receives the DOM node and null detachment exactly once", async () => {
  const calls = [];
  await mount(calendarRoot({ rootRef: (node) => { calls.push(node); } }));
  const node = container.firstElementChild;
  assert.deepEqual(calls, [node]);
  await unmount();
  assert.deepEqual(calls, [node, null]);
});

test("calendar preserves React 19 cleanup instead of calling the ref with null", async () => {
  const calls = [];
  let cleanups = 0;
  await mount(calendarRoot({
    rootRef: (node) => {
      calls.push(node);
      return () => { cleanups += 1; };
    },
  }));
  const node = container.firstElementChild;
  assert.deepEqual(calls, [node]);
  assert.equal(cleanups, 0);
  await unmount();
  assert.equal(cleanups, 1);
  assert.deepEqual(calls, [node]);
});

test("calendar detaches an old ref before attaching its replacement", async () => {
  const first = React.createRef();
  const second = React.createRef();
  const element = calendarRoot({ rootRef: first });
  await mount(element);
  const node = first.current;
  await React.act(() => root.render(React.cloneElement(element, { rootRef: second })));
  assert.equal(first.current, null);
  assert.equal(second.current, node);
  await unmount();
  assert.equal(second.current, null);
});

test("calendar root accepts absent and explicitly null refs", async () => {
  const element = calendarRoot({});
  await mount(element);
  assert.ok(container.querySelector('[data-slot="calendar"]'));
  await React.act(() => root.render(React.cloneElement(element, { rootRef: null })));
  assert.ok(container.querySelector('[data-slot="calendar"]'));
});

test("real DayPicker renders with the default calendar root", async () => {
  await mount(React.createElement(Calendar, { defaultMonth: new Date(2026, 9, 1) }));
  assert.ok(container.querySelector('[data-slot="calendar"]'));
  assert.ok(container.querySelector('button[aria-label="Go to the Next Month"]'));
  assert.match(container.textContent, /October 2026/);
});

test("spinner has loading accessibility attributes and its animation class", async () => {
  await mount(React.createElement(Spinner));
  const svg = container.querySelector("svg");
  assert.ok(svg instanceof SVGElement);
  assert.equal(svg.getAttribute("role"), "status");
  assert.equal(svg.getAttribute("aria-label"), "Loading");
  assert.ok(svg.classList.contains("animate-spin"));
  assert.ok(svg.classList.contains("size-4"));
});

test("spinner forwards SVG props, custom classes and events", async () => {
  let clicks = 0;
  await mount(React.createElement(Spinner, {
    className: "text-green-500",
    width: 28,
    height: 30,
    strokeWidth: 3,
    color: "green",
    viewBox: "0 0 32 32",
    "data-testid": "loading-icon",
    onClick: () => { clicks += 1; },
  }));
  const svg = container.querySelector("svg");
  assert.equal(svg.getAttribute("width"), "28");
  assert.equal(svg.getAttribute("height"), "30");
  assert.equal(svg.getAttribute("stroke-width"), "3");
  assert.equal(svg.getAttribute("stroke"), "green");
  assert.equal(svg.getAttribute("viewBox"), "0 0 32 32");
  assert.equal(svg.getAttribute("data-testid"), "loading-icon");
  assert.ok(svg.classList.contains("text-green-500"));
  assert.ok(svg.classList.contains("animate-spin"));
  await React.act(() => svg.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  assert.equal(clicks, 1);
});

test("spinner forwards an SVG object ref and clears it on unmount", async () => {
  const ref = React.createRef();
  await mount(React.createElement(Spinner, { ref }));
  assert.equal(ref.current, container.querySelector("svg"));
  assert.ok(ref.current instanceof SVGElement);
  await unmount();
  assert.equal(ref.current, null);
});

test("spinner forwards callback refs including React 19 cleanup", async () => {
  const calls = [];
  let cleanups = 0;
  await mount(React.createElement(Spinner, {
    ref: (node) => {
      calls.push(node);
      return () => { cleanups += 1; };
    },
  }));
  assert.deepEqual(calls, [container.querySelector("svg")]);
  await unmount();
  assert.equal(cleanups, 1);
  assert.equal(calls.length, 1);
});

test("spinner allows a caller to customize its accessible loading label", async () => {
  await mount(React.createElement(Spinner, { "aria-label": "Saving workout", role: "img" }));
  const svg = container.querySelector("svg");
  assert.equal(svg.getAttribute("aria-label"), "Saving workout");
  assert.equal(svg.getAttribute("role"), "img");
  assert.ok(svg.classList.contains("animate-spin"));
});