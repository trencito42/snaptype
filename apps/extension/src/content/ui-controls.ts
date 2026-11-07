// Custom form controls for the in-page dynamic form (no native select/checkbox/date widgets).
// Each control keeps a hidden native element as the value holder so existing code can keep reading
// `.value` / `.checked`, while the user only ever sees and uses the custom UI.

const CHEVRON = '<svg viewBox="0 0 448 512" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M201.4 374.6a32 32 0 0 0 45.3 0l160-160a32 32 0 1 0-45.3-45.3L224 306.7 86.6 169.4a32 32 0 1 0-45.3 45.3l160 160z"/></svg>';
const CHECK = '<svg viewBox="0 0 448 512" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M438.6 105.4a32 32 0 0 1 0 45.3l-256 256a32 32 0 0 1-45.3 0l-128-128a32 32 0 0 1 45.3-45.3L160 338.7l233.4-233.3a32 32 0 0 1 45.2 0z"/></svg>';

let popoverSeq = 0;

function hideNative(el: HTMLElement) {
  el.setAttribute('tabindex', '-1');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('snaptype-native-hidden');
}

function placePopover(pop: HTMLElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  pop.style.minWidth = `${Math.max(r.width, 180)}px`;
  const below = window.innerHeight - r.bottom;
  const popH = pop.offsetHeight || 220;
  const up = below < popH + 12 && r.top > below;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = up ? `${Math.max(8, r.top - popH - 6)}px` : `${r.bottom + 6}px`;
}

/** Custom dropdown. Returns the visible root plus the hidden <select> that holds the value. */
export type DropdownItem = string | { value: string; label: string };

export function createDropdown(rawItems: DropdownItem[], selected: string | undefined, labelText: string, existing?: HTMLSelectElement) {
  const items = rawItems.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const values = items.map((o) => o.value);
  const select = existing ?? document.createElement('select');
  hideNative(select);
  if (!existing) {
    for (const o of items) {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label;
      select.appendChild(opt);
    }
  }
  if (selected && values.includes(selected)) select.value = selected;

  const root = document.createElement('div');
  root.className = 'snaptype-dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'snaptype-dd-btn';
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', labelText);
  const text = document.createElement('span');
  const caret = document.createElement('span');
  caret.className = 'snaptype-dd-caret';
  caret.innerHTML = CHEVRON;
  btn.append(text, caret);
  root.append(btn);
  if (!existing) root.append(select);

  let list: HTMLUListElement | null = null;
  let active = 0;
  const sync = () => { text.textContent = items.find((o) => o.value === select.value)?.label || 'Choose…'; };
  sync();

  const close = (refocus = true) => {
    if (!list) return;
    list.remove(); list = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outside, true);
    if (refocus) btn.focus();
  };
  const outside = (e: MouseEvent) => { const t = e.target as Node; if (!list?.contains(t) && !btn.contains(t)) close(false); };
  const paint = () => {
    if (!list) return;
    [...list.children].forEach((li, i) => {
      li.classList.toggle('is-active', i === active);
      li.setAttribute('aria-selected', String(values[i] === select.value));
    });
    (list.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i: number) => {
    select.value = values[i];
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync(); close();
  };
  const open = () => {
    if (list) return;
    const id = `snaptype-dd-list-${++popoverSeq}`;
    list = document.createElement('ul');
    list.id = id; list.className = 'snaptype-dd-list'; list.setAttribute('role', 'listbox');
    items.forEach((o, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.innerHTML = `<span></span>${values[i] === select.value ? CHECK : ''}`;
      (li.firstChild as HTMLElement).textContent = o.label;
      li.onmousedown = (e) => e.preventDefault();
      li.onclick = () => choose(i);
      li.onmouseenter = () => { active = i; paint(); };
      list!.appendChild(li);
    });
    document.body.appendChild(list);
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', id);
    active = Math.max(0, values.indexOf(select.value));
    placePopover(list, btn); paint();
    document.addEventListener('mousedown', outside, true);
  };
  btn.onclick = () => (list ? close(false) : open());
  btn.onkeydown = (e) => {
    if (!list) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); open(); } return; }
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; paint(); }
    else if (e.key === 'End') { e.preventDefault(); active = items.length - 1; paint(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  };
  return { root, select };
}

/** Accessible switch bound to a hidden checkbox (keeps `.checked`). */
export function createSwitch(initial: boolean, labelText: string) {
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = initial;
  hideNative(chk);

  const root = document.createElement('div');
  root.className = 'snaptype-sw-row';
  const sw = document.createElement('button');
  sw.type = 'button';
  sw.className = 'snaptype-sw';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-label', labelText);
  sw.innerHTML = '<span class="snaptype-sw-knob"></span>';
  const state = document.createElement('span');
  state.className = 'snaptype-sw-text';
  const sync = () => { sw.setAttribute('aria-checked', String(chk.checked)); sw.classList.toggle('is-on', chk.checked); state.textContent = chk.checked ? 'Yes' : 'No'; };
  sw.onclick = () => { chk.checked = !chk.checked; chk.dispatchEvent(new Event('change', { bubbles: true })); sync(); };
  state.onclick = sw.onclick;
  sync();
  root.append(sw, state, chk);
  return { root, checkbox: chk };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Custom date picker (calendar popover). Value is YYYY-MM-DD in a hidden text input. */
export function createDatePicker(initial: string | undefined, labelText: string) {
  const hidden = document.createElement('input');
  hidden.type = 'text';
  hidden.value = /^\d{4}-\d{2}-\d{2}$/.test(initial || '') ? (initial as string) : '';
  hideNative(hidden);

  const root = document.createElement('div');
  root.className = 'snaptype-dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'snaptype-dd-btn';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', labelText);
  const text = document.createElement('span');
  const caret = document.createElement('span');
  caret.className = 'snaptype-dd-caret';
  caret.innerHTML = CHEVRON;
  btn.append(text, caret);
  root.append(btn, hidden);
  const sync = () => { text.textContent = hidden.value || 'Pick a date'; text.classList.toggle('snaptype-placeholder', !hidden.value); };
  sync();

  let pop: HTMLDivElement | null = null;
  let view = hidden.value ? new Date(hidden.value + 'T00:00:00') : new Date();
  const close = (refocus = true) => {
    if (!pop) return;
    pop.remove(); pop = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outside, true);
    if (refocus) btn.focus();
  };
  const outside = (e: MouseEvent) => { const t = e.target as Node; if (!pop?.contains(t) && !btn.contains(t)) close(false); };
  const pick = (d: Date) => { hidden.value = iso(d); hidden.dispatchEvent(new Event('change', { bubbles: true })); sync(); close(); };
  const draw = () => {
    if (!pop) return;
    pop.textContent = '';
    const head = document.createElement('div');
    head.className = 'snaptype-cal-head';
    const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '‹'; prev.setAttribute('aria-label', 'Previous month');
    const next = document.createElement('button'); next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', 'Next month');
    const title = document.createElement('strong'); title.textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
    prev.onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); };
    next.onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); };
    head.append(prev, title, next);
    const grid = document.createElement('div');
    grid.className = 'snaptype-cal-grid';
    for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) { const h = document.createElement('span'); h.className = 'snaptype-cal-dow'; h.textContent = d; grid.appendChild(h); }
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.appendChild(document.createElement('span'));
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const todayIso = iso(new Date());
    for (let day = 1; day <= days; day++) {
      const d = new Date(view.getFullYear(), view.getMonth(), day);
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = String(day);
      b.className = 'snaptype-cal-day' + (iso(d) === hidden.value ? ' is-selected' : '') + (iso(d) === todayIso ? ' is-today' : '');
      b.onclick = () => pick(d);
      grid.appendChild(b);
    }
    const foot = document.createElement('div');
    foot.className = 'snaptype-cal-foot';
    const today = document.createElement('button'); today.type = 'button'; today.textContent = 'Today'; today.onclick = () => pick(new Date());
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear';
    clear.onclick = () => { hidden.value = ''; hidden.dispatchEvent(new Event('change', { bubbles: true })); sync(); close(); };
    foot.append(today, clear);
    pop.append(head, grid, foot);
    placePopover(pop, btn);
  };
  const open = () => {
    if (pop) return;
    pop = document.createElement('div');
    pop.className = 'snaptype-cal'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose a date');
    document.body.appendChild(pop);
    btn.setAttribute('aria-expanded', 'true');
    view = hidden.value ? new Date(hidden.value + 'T00:00:00') : new Date();
    draw();
    document.addEventListener('mousedown', outside, true);
  };
  btn.onclick = () => (pop ? close(false) : open());
  btn.onkeydown = (e) => {
    if (e.key === 'Escape' && pop) { e.preventDefault(); e.stopPropagation(); close(); }
    else if (!pop && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); open(); }
  };
  return { root, input: hidden };
}


/** Replace the visible part of an existing native <select> with the custom dropdown (the select stays as value holder). */
export function enhanceSelect(select: HTMLSelectElement, labelText: string): void {
  select.parentElement?.querySelectorAll(':scope > .snaptype-dd').forEach((n) => n.remove());
  const items = [...select.options].map((o) => ({ value: o.value, label: o.textContent || o.value }));
  const dd = createDropdown(items, select.value, labelText, select);
  select.parentElement?.insertBefore(dd.root, select);
}
