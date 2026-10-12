// A tiny DOM, just enough to run the page's real app.js under Node with no dependencies.
// Storage and cookie are spies: any touch is recorded, so a test can assert there were none.
// It also models what the page relies on from <dialog>: showModal(), close() and the "close" event,
// plus focus tracking (document.activeElement) and CSSOM style properties.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
export const INDEX_HTML = readFileSync(`${here}../../static/index.html`, "utf-8");
export const SEED = JSON.parse(readFileSync(`${here}../../data/patients.json`, "utf-8"));
const HTML_IDS = new Set([...INDEX_HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

let active = null;

class FakeElement {
  constructor(tag, id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.hidden = false;
    this.value = "";
    this.className = "";
    this.dataset = {};
    this.attrs = {};
    this.handlers = {};
    this.style = {};
    this.open = false;
    this.offsetWidth = 120;
    this.offsetHeight = 24;
    this.clientWidth = 600;
    this.clientHeight = 400;
    this._text = "";
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  append(...nodes) {
    for (const n of nodes) this.children.push(typeof n === "string" ? Object.assign(new FakeElement("#text"), { _text: n }) : n);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  addEventListener(type, fn) {
    (this.handlers[type] ||= []).push(fn);
  }
  // Dispatch an event to this element's listeners. `target` defaults to the element itself.
  fire(type, extra = {}) {
    const event = {
      type,
      target: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra,
    };
    for (const fn of this.handlers[type] || []) fn(event);
    return event;
  }
  focus() {
    active = this;
    this.fire("focus");
  }
  showModal() {
    this.open = true;
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.fire("close");
  }
  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  querySelector(sel) {
    return this.descendants().find((e) => e.tagName === sel.toUpperCase()) || null;
  }
}

// Installs fake globals and returns the spies. `serve(path, headers)` answers like the API.
export function installDom(serve) {
  active = null;
  const spy = { storage: [], cookie: [], fetches: [] };
  const storage = (name) => ({
    get length() {
      spy.storage.push(`${name}.length`);
      return 0;
    },
    getItem: (k) => (spy.storage.push(`${name}.getItem(${k})`), null),
    setItem: (k) => spy.storage.push(`${name}.setItem(${k})`),
    removeItem: (k) => spy.storage.push(`${name}.removeItem(${k})`),
    clear: () => spy.storage.push(`${name}.clear`),
    key: () => (spy.storage.push(`${name}.key`), null),
  });
  const byId = new Map();
  const created = [];
  const document = {
    getElementById(id) {
      if (!HTML_IDS.has(id)) throw new Error(`app.js asks for #${id}, which index.html does not have`);
      if (!byId.has(id)) byId.set(id, new FakeElement(id === "card" ? "dialog" : "div", id));
      return byId.get(id);
    },
    createElement(tag) {
      const e = new FakeElement(tag);
      created.push(e);
      return e;
    },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, "");
      return created.filter((e) => e.className.split(" ").includes(cls));
    },
    get activeElement() {
      return active;
    },
    get cookie() {
      spy.cookie.push("get");
      return "";
    },
    set cookie(v) {
      spy.cookie.push(`set:${v}`);
    },
  };
  globalThis.document = document;
  globalThis.localStorage = storage("localStorage");
  globalThis.sessionStorage = storage("sessionStorage");
  globalThis.window = globalThis;
  globalThis.fetch = async (path, options = {}) => {
    spy.fetches.push({ path, options });
    const { status, body } = serve(path, options.headers || {});
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { spy, byId, created, document };
}

// `datasets` maps an accepted key to the records the API returns for it.
export const apiFor = (goodKey, datasets = { [goodKey]: SEED }) => (path, headers) => {
  const data = datasets[headers["x-api-key"]];
  if (!data) return { status: 403, body: { detail: "Forbidden" } };
  if (path === "/patients") return { status: 200, body: data };
  const one = data.find((p) => `/patients/${p.patient_id}` === path);
  return one ? { status: 200, body: one } : { status: 404, body: { detail: "Patient not found" } };
};
