// Small DOM/event stub: no browser, assets or network needed for UI action tests.
export class DomNode {
  children: DomNode[] = [];
  className = ''; textContent = ''; innerHTML = ''; id = ''; disabled = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style = { setProperty() {} };
  listeners = new Map<string, Set<(event: any) => unknown>>();
  constructor(readonly tagName = 'DIV') {}
  classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    add: (name: string) => { if (!this.classList.contains(name)) this.className += ' ' + name; },
    remove: (name: string) => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); },
    toggle: (name: string, force?: boolean) => { const on = force ?? !this.classList.contains(name); if (on) this.classList.add(name); else this.classList.remove(name); return on; },
  };
  appendChild(node: DomNode) { this.children.push(node); return node; }
  append(...nodes: DomNode[]) { this.children.push(...nodes); }
  prepend(node: DomNode) { this.children.unshift(node); }
  replaceChildren(...nodes: DomNode[]) { this.children = nodes; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; if (name === 'class') this.className = value; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  addEventListener(type: string, fn: (event: any) => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (event: any) => unknown) { this.listeners.get(type)?.delete(fn); }
  async fire(type: string, props = {}) {
    if (type === 'click' && this.disabled) return;
    const event = { target: this, preventDefault() {}, stopPropagation() {}, ...props };
    await Promise.all([...this.listeners.get(type) ?? []].map(fn => fn(event)));
  }
  all(): DomNode[] { return this.children.flatMap(n => [n, ...n.all()]); }
  querySelectorAll(selector: string): DomNode[] {
    return this.all().filter(n => selector === '[data-scroll]' ? n.dataset.scroll !== undefined
      : selector.startsWith('.') ? n.classList.contains(selector.slice(1)) : n.tagName === selector.toUpperCase());
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() { return { width: 600, height: 400, left: 0, top: 0 }; }
  getContext() { return { setTransform() {} }; }
  button(label: string) {
    const node = this.all().find(n => n.tagName === 'BUTTON' && n.textContent === label);
    if (!node) throw Error('Missing button: ' + label);
    return node;
  }
}

export function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
