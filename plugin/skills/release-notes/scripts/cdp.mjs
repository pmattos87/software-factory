// Drive the staging app's WebView2 over the DevTools protocol (port 9222).
// usage: node cdp.mjs eval "<js expr>" | node cdp.mjs run <steps.mjs>
// steps.mjs: export default async ({ ev, shot, wait, go, click, fill, send }) => { ... }
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const err = res.result?.exceptionDetails;
  if (err) throw new Error(JSON.stringify(err.exception?.description ?? err));
  return res.result?.result?.value;
};
const go = async (hash) => {
  await ev(`location.hash=${JSON.stringify(hash)}`);
  await wait(1200);
};
// Clicks the LAST element matching `selector` whose text includes `text`.
const click = async (text, selector = "button,a,[role=tab],[role=option],[role=menuitem]") => {
  const ok = await ev(
    `(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.innerText&&e.innerText.trim().includes(${JSON.stringify(text)}));const e=els[els.length-1];if(!e)return false;e.scrollIntoView({block:'center'});e.click();return true})()`,
  );
  if (!ok) throw new Error(`no element with text: ${text}`);
  await wait(700);
};
// React ignores a plain `.value =`; the native setter plus an input event is what it hears.
const fill = async (selector, value) => {
  const ok = await ev(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
  );
  if (!ok) throw new Error(`no input: ${selector}`);
  await wait(300);
};
// clip is in CSS px; { x: 0, y: 44, width: 1600, height: 956 } drops the staging banner.
const shot = async (file, clip) => {
  const params = { format: "png" };
  if (clip) params.clip = { ...clip, scale: 1 };
  const res = await send("Page.captureScreenshot", params);
  writeFileSync(file, Buffer.from(res.result.data, "base64"));
  console.log("saved", file);
};

// The override dies with this connection, so every run sets it again.
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1.5, mobile: false });
await wait(600);

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "eval") console.log(JSON.stringify(await ev(arg), null, 1));
  else if (cmd === "run") {
    const mod = await import(`${pathToFileURL(resolve(arg)).href}?t=${Date.now()}`);
    await mod.default({ ev, shot, wait, go, click, fill, send });
  }
} finally {
  ws.close();
}
