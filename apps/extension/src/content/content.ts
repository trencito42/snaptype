import { ReverseShortcutMatcher, renderSnippet, extractFormFields } from '@snaptype/snippet-engine';
import { DomDetector, TextInserter, BrowserApi } from '@snaptype/browser-compat';
import { createDropdown, createSwitch, createDatePicker } from './ui-controls.js';
import { Snippet, UserPreferences, DEFAULT_PREFERENCES, DynamicFormField, DataTable, validateDashboardMessage } from '@snaptype/shared';

declare const __SNAPTYPE_APP_URL__: string;

function snaptypeAsset(relativePath: string): string {
  return chrome.runtime.getURL(relativePath);
}

/** Same brand row as snaptype.org header / extension popup */
function createSnaptypeBrand(): HTMLElement {
  const brand = document.createElement('div');
  brand.className = 'snaptype-brand';
  const img = document.createElement('img');
  img.src = snaptypeAsset('assets/logo.svg');
  img.width = 24;
  img.height = 24;
  img.alt = '';
  img.decoding = 'async';
  const wordmark = document.createElement('span');
  wordmark.className = 'snaptype-wordmark';
  wordmark.innerHTML = 'snap<b>type</b>';
  brand.append(img, wordmark);
  return brand;
}

/**
 * Checks whether a snippet is allowed to expand on the current domain (ST-012)
 */
function isSnippetAllowedOnCurrentSite(snippet: Snippet, currentHostname: string): boolean {
  if (!snippet.siteRestrictions || !snippet.siteRestrictions.mode || !snippet.siteRestrictions.domains?.length) {
    return true;
  }
  const host = currentHostname.toLowerCase();
  const domains = snippet.siteRestrictions.domains.map((d) => d.toLowerCase().trim()).filter(Boolean);
  const matches = domains.some((d) => host === d || host.endsWith('.' + d));

  if (snippet.siteRestrictions.mode === 'allow') {
    return matches;
  }
  if (snippet.siteRestrictions.mode === 'block') {
    return !matches;
  }
  return true;
}

/**
 * Helper to match user-configured hotkey string (ST-011)
 * Example: 'Ctrl+Shift+Space', 'Alt+Shift+S', 'Meta+K'
 */
function isMatchingHotkey(e: KeyboardEvent, shortcutStr?: string): boolean {
  const hotkey = (shortcutStr || 'Ctrl+Shift+Space').toLowerCase();
  const parts = hotkey.split('+').map((p) => p.trim());

  const expectCtrl = parts.includes('ctrl') || parts.includes('control');
  const expectShift = parts.includes('shift');
  const expectAlt = parts.includes('alt');
  const expectMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');

  if (e.ctrlKey !== expectCtrl) return false;
  if (e.shiftKey !== expectShift) return false;
  if (e.altKey !== expectAlt) return false;
  if (e.metaKey !== expectMeta) return false;

  const keyPart = parts.find((p) => !['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd', 'command'].includes(p)) || 'space';

  if (keyPart === 'space' && (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar')) {
    return true;
  }

  const code = e.code.toLowerCase();
  return e.key.toLowerCase() === keyPart || code === `key${keyPart}` || code === `digit${keyPart}` || code === keyPart;
}

export class ContentEngine {
  private matcher: ReverseShortcutMatcher = new ReverseShortcutMatcher();
  private snippets: Snippet[] = [];
  private tables: DataTable[] = [];
  private preferences: UserPreferences = { ...DEFAULT_PREFERENCES };
  private keystrokeBuffer: string = '';
  private readonly MAX_BUFFER_LENGTH = 64;
  private isExcluded: boolean = false;

  // Active target being edited
  private activeTarget: HTMLElement | null = null;

  // UI Overlays
  private assistantOverlay: HTMLElement | null = null;
  private formOverlay: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    // 1. Always attach event listeners first so domain exclusions can be reactive (ST-013)
    this.attachEventListeners();

    // 2. Fetch synced snippets and preferences from background
    await this.refreshData();
  }

  public updateExclusionStatus() {
    const hostname = window.location.hostname || '';
    this.isExcluded = DomDetector.isExcludedDomain(hostname, this.preferences.excludedDomains);
  }

  private refreshSeq = 0;

  /**
   * Fetch the library from the background worker. The worker may be cold-starting (MV3 workers are
   * terminated when idle), so a failed request is retried a few times with backoff instead of leaving
   * the page without snippets. Responses can arrive out of order: only the latest request may apply.
   */
  public async refreshData(attempt = 0): Promise<void> {
    const seq = ++this.refreshSeq;
    try {
      const response = await BrowserApi.sendMessage({ action: 'GET_DATA' });
      if (seq !== this.refreshSeq) return;
      if (response && response.snippets) {
        this.snippets = response.snippets;
        this.tables = response.tables || [];
        this.preferences = response.preferences || this.preferences;
        this.updateExclusionStatus();
        this.matcher.rebuild(this.snippets, this.preferences.caseSensitive);
        return;
      }
      throw new Error('empty response');
    } catch {
      if (seq !== this.refreshSeq || attempt >= 3) return;
      const delay = [400, 1500, 4000][attempt];
      setTimeout(() => { if (seq === this.refreshSeq) void this.refreshData(attempt + 1); }, delay);
    }
  }

  private attachEventListeners() {
    // Track active element and clear buffer on selection/focus change
    document.addEventListener(
      'focusin',
      (e) => {
        this.activeTarget = e.target as HTMLElement;
        this.keystrokeBuffer = '';
      },
      true
    );

    document.addEventListener(
      'click',
      () => {
        this.keystrokeBuffer = '';
      },
      true
    );

    // Keystroke listening
    document.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
    document.addEventListener('input', (e) => this.handleInput(e), true);

    // Dashboard workspace synchronization bridge (ST-037 / Blocker 2 / Issue 5)
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      const configuredAppUrl = typeof __SNAPTYPE_APP_URL__ !== 'undefined' ? __SNAPTYPE_APP_URL__ : undefined;
      const validation = validateDashboardMessage(
        event.data,
        event.origin,
        window.location.origin,
        configuredAppUrl
      );

      if (!validation.valid) {
        return;
      }

      BrowserApi.sendMessage({
        action: 'SELECT_WORKSPACE',
        workspaceId: validation.message.workspaceId
      }).catch(() => {});
    });

    // Runtime messages from background (e.g. open assistant hotkey or popup insert)
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
        if (message.action === 'OPEN_ASSISTANT') {
          this.openAssistant();
          sendResponse?.({ success: true });
        }
        if (message.action === 'REFRESH_DATA') {
          this.refreshData();
          sendResponse?.({ success: true });
        }
        if (message.action === 'EXPAND_SNIPPET') {
          const target = this.activeTarget || (DomDetector.getActiveElement() as HTMLElement);
          if (!target || this.isExcluded) {
            sendResponse?.({ success: false, error: 'No editable target or site is excluded' });
            return;
          }
          const hostname = window.location.hostname || '';
          if (!isSnippetAllowedOnCurrentSite(message.snippet, hostname)) {
            sendResponse?.({ success: false, error: 'Snippet not allowed on this site' });
            return;
          }
          const dynamicFields = extractFormFields(message.snippet.plainContent);
          if (dynamicFields.length > 0) {
            this.openDynamicForm(target, message.snippet, dynamicFields, 0);
            sendResponse?.({ success: true, openedForm: true });
          } else {
            const rendered = this.renderSnippetWithContext(message.snippet.plainContent, {}, target);
            if (rendered.errors && rendered.errors.length > 0) {
              this.showErrorTooltip(target, rendered.errors.join('; '));
              sendResponse?.({ success: false, error: rendered.errors.join('; ') });
              return;
            }
            const inserted = TextInserter.insert(target, {
              matchLength: 0,
              replacementText: rendered.text,
              cursorOffset: rendered.cursorOffset
            });
            BrowserApi.sendMessage({ action: 'RECORD_USAGE', snippetId: message.snippet.id });
            sendResponse?.({ success: inserted });
          }
        }
        if (message.action === 'INSERT_TEXT') {
          const target = this.activeTarget || (DomDetector.getActiveElement() as HTMLElement);
          if (target && !this.isExcluded) {
            const inserted = TextInserter.insert(target, {
              matchLength: 0,
              replacementText: message.text,
              cursorOffset: message.cursorOffset
            });
            sendResponse?.({ success: inserted });
          } else {
            sendResponse?.({ success: false, error: 'Target not editable or site excluded' });
          }
        }
      });
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.isExcluded) return;

    // Check Assistant hotkey: supports user preference (ST-011)
    if (isMatchingHotkey(e, this.preferences.assistantShortcut)) {
      e.preventDefault();
      e.stopPropagation();
      this.openAssistant();
      return;
    }

    // Reset buffer on navigation/escape keys
    if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      this.keystrokeBuffer = '';
    } else if (e.key === 'Backspace') {
      this.keystrokeBuffer = this.keystrokeBuffer.slice(0, -1);
    }
  }

  private handleInput(e: Event) {
    if (this.isExcluded) return;

    // Guard against synthetic input events dispatched by SnapType itself (ST-016)
    if (TextInserter.isProgrammaticInsert || (e as any).__snaptype_synthetic) {
      return;
    }

    const target = (e.target || this.activeTarget) as HTMLElement;
    if (!target) return;

    const inspected = DomDetector.inspectElement(target);
    if (inspected.category === 'none' || (this.preferences.disabledInSensitiveFields && inspected.isSensitive)) {
      this.keystrokeBuffer = '';
      return;
    }

    this.activeTarget = target;

    // Extract input event data
    const inputEvent = e as InputEvent;
    if (inputEvent.data) {
      this.keystrokeBuffer = (this.keystrokeBuffer + inputEvent.data).slice(-this.MAX_BUFFER_LENGTH);
    } else if (inputEvent.inputType === 'deleteContentBackward') {
      this.keystrokeBuffer = this.keystrokeBuffer.slice(0, -1);
      return;
    }

    // Perform sub-millisecond reverse trie match
    const match = this.matcher.findMatch(this.keystrokeBuffer, this.preferences);
    if (!match) return;

    // Verify per-snippet site restrictions (ST-012)
    const hostname = window.location.hostname || '';
    if (!isSnippetAllowedOnCurrentSite(match.snippet, hostname)) {
      return;
    }

    // Found matching shortcut
    this.keystrokeBuffer = ''; // Reset buffer to prevent re-triggering

    const snippet = match.snippet;
    const dynamicFields = extractFormFields(snippet.plainContent);

    if (dynamicFields.length > 0) {
      // Dynamic inputs required: open modal form dialog
      this.openDynamicForm(target, snippet, dynamicFields, match.matchLength);
    } else {
      // Plain/static replacement: insert immediately
      const rendered = this.renderSnippetWithContext(snippet.plainContent, {}, target);
      if (rendered.errors && rendered.errors.length > 0) {
        this.showErrorTooltip(target, rendered.errors.join('; '));
        return;
      }
      TextInserter.insert(target, {
        matchLength: match.matchLength,
        replacementText: rendered.text,
        cursorOffset: rendered.cursorOffset
      });

      // Record usage asynchronously in background (ST-010)
      BrowserApi.sendMessage({ action: 'RECORD_USAGE', snippetId: snippet.id });
    }
  }

  private getSelectedText(target?: HTMLElement | null): string {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      if (end > start) {
        return target.value.substring(start, end);
      }
    }
    try {
      const sel = window.getSelection();
      if (sel && sel.toString()) {
        return sel.toString();
      }
    } catch {
      // ignore selection errors
    }
    return '';
  }

  private showErrorTooltip(target: HTMLElement, errorMessage: string) {
    const existing = document.querySelector('.snaptype-error-tooltip');
    if (existing) existing.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'snaptype-error-tooltip';
    tooltip.textContent = `SnapType: ${errorMessage}`;
    tooltip.style.position = 'absolute';
    tooltip.style.backgroundColor = '#1f2937';
    tooltip.style.color = '#f87171';
    tooltip.style.padding = '6px 10px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '12px';
    tooltip.style.zIndex = '2147483647';
    tooltip.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.maxWidth = '320px';
    tooltip.style.whiteSpace = 'normal';
    tooltip.style.transition = 'opacity 0.3s ease';

    try {
      const rect = target.getBoundingClientRect();
      const top = window.scrollY + rect.bottom + 4;
      const left = window.scrollX + Math.max(10, rect.left);
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    } catch {
      tooltip.style.top = '20px';
      tooltip.style.right = '20px';
    }

    document.body.appendChild(tooltip);

    setTimeout(() => {
      tooltip.style.opacity = '0';
      setTimeout(() => tooltip.remove(), 300);
    }, 4000);
  }

  private renderSnippetWithContext(template: string, variables: Record<string, any> = {}, target?: HTMLElement | null) {
    const currentHost = window.location.hostname || '';
    return renderSnippet(template, {
      variables,
      siteContext: {
        url: window.location.href,
        hostname: currentHost
      },
      selectedText: this.getSelectedText(target || this.activeTarget),
      snippetResolver: (shortcut: string) => {
        const found = this.snippets.find((s) => s.shortcut.toLowerCase() === shortcut.toLowerCase());
        if (!found) return null;
        if (!isSnippetAllowedOnCurrentSite(found, currentHost)) return null;
        return found.plainContent;
      },
      tableResolver: (tableName: string, lookupKey: string, lookupVal: any, targetCol: string) => {
        const table = this.tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
        if (!table || !table.rows) return null;
        const lookupStr = String(lookupVal).toLowerCase().trim();
        const match = table.rows.find((r) => {
          const rowVal = r.data && r.data[lookupKey];
          return rowVal !== undefined && String(rowVal).toLowerCase().trim() === lookupStr;
        });
        if (!match || !match.data) return null;
        const targetVal = match.data[targetCol];
        return targetVal !== undefined ? String(targetVal) : null;
      }
    });
  }

  /**
   * Interactive Dynamic Form Dialog (ST-015: supports checkboxes, dates, validation)
   */
  private openDynamicForm(target: HTMLElement, snippet: Snippet, fields: DynamicFormField[], matchLength: number) {
    if (this.formOverlay) this.formOverlay.remove();

    const isTextControl = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    let savedRange: Range | null = null;
    let savedSelectionStart = -1;
    let savedSelectionEnd = -1;
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        savedSelectionStart = target.selectionStart ?? -1;
        savedSelectionEnd = target.selectionEnd ?? -1;
      }
    } catch {}

    const overlay = document.createElement('div');
    overlay.className = 'snaptype-overlay';

    const modal = document.createElement('div');
    modal.className = 'snaptype-modal';

    const header = document.createElement('div');
    header.className = 'snaptype-modal-header';
    const brandRow = document.createElement('div');
    brandRow.className = 'snaptype-modal-top';
    brandRow.appendChild(createSnaptypeBrand());
    const titleRow = document.createElement('div');
    titleRow.className = 'snaptype-modal-top';
    const titleEl = document.createElement('div');
    titleEl.className = 'snaptype-modal-title';
    titleEl.textContent = snippet.name;
    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'snaptype-badge';
    badgeSpan.textContent = snippet.shortcut;
    titleRow.append(titleEl, badgeSpan);
    header.append(brandRow, titleRow);
    modal.appendChild(header);

    const form = document.createElement('div');
    form.className = 'snaptype-form-body';

    const inputs: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};
    const fieldDefs: Record<string, DynamicFormField> = {};
    const errorContainers: Record<string, HTMLElement> = {};

    for (const field of fields) {
      fieldDefs[field.name] = field;
      const row = document.createElement('div');
      row.className = 'snaptype-form-row';

      const label = document.createElement('label');
      label.textContent = field.label || field.name;
      if (field.required) {
        const reqSpan = document.createElement('span');
        reqSpan.className = 'snaptype-form-error';
        reqSpan.textContent = ' *';
        reqSpan.style.display = 'inline';
        label.appendChild(reqSpan);
      }
      row.appendChild(label);

      let inputEl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

      if (field.type === 'toggle') {
        const sw = createSwitch(Boolean(field.defaultValue), field.label || field.name);
        inputEl = sw.checkbox;
        row.appendChild(sw.root);
      } else if (field.type === 'dropdown') {
        const dd = createDropdown(field.options || [], typeof field.defaultValue === 'string' ? field.defaultValue : undefined, field.label || field.name);
        inputEl = dd.select;
        row.appendChild(dd.root);
      } else if (field.type === 'paragraph') {
        const ta = document.createElement('textarea');
        ta.className = 'snaptype-input';
        ta.rows = 3;
        ta.value = String(field.defaultValue || '');
        inputEl = ta;
        row.appendChild(inputEl);
      } else {
        if (field.type === 'date') {
          const dp = createDatePicker(String(field.defaultValue || ''), field.label || field.name);
          inputEl = dp.input;
          row.appendChild(dp.root);
        } else {
          const inp = document.createElement('input');
          inp.className = 'snaptype-input';
          inp.type = 'text';
          inp.value = String(field.defaultValue || '');
          inputEl = inp;
          row.appendChild(inputEl);
        }
      }

      const errSpan = document.createElement('div');
      errSpan.className = 'snaptype-form-error';
      errSpan.style.display = 'none';
      errorContainers[field.name] = errSpan;
      row.appendChild(errSpan);

      inputs[field.name] = inputEl;
      form.appendChild(row);
    }

    modal.appendChild(form);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'snaptype-modal-actions';

    const cancelAction = () => {
      overlay.remove();
      this.formOverlay = null;
      target.focus();
      try {
        if (!isTextControl && savedRange && window.getSelection) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        } else if (
          (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
          savedSelectionStart >= 0 &&
          savedSelectionEnd >= 0
        ) {
          target.setSelectionRange(savedSelectionStart, savedSelectionEnd);
        }
      } catch {}
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'snaptype-btn snaptype-btn-secondary';
    cancelBtn.textContent = 'Cancel (Esc)';
    cancelBtn.onclick = cancelAction;

    const submitBtn = document.createElement('button');
    submitBtn.className = 'snaptype-btn snaptype-btn-primary';
    submitBtn.textContent = 'Insert Snippet (Enter)';

    const applyValues = () => {
      let hasError = false;
      const vars: Record<string, any> = {};

      for (const [k, el] of Object.entries(inputs)) {
        const def = fieldDefs[k];
        const errEl = errorContainers[k];
        if (errEl) errEl.style.display = 'none';

        let val: any;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          val = el.checked;
        } else {
          val = el.value.trim();
        }

        // Validate required fields (ST-015)
        if (def && def.required && (!val || (typeof val === 'string' && val.length === 0))) {
          hasError = true;
          if (errEl) {
            errEl.textContent = `${def.label || def.name} is required.`;
            errEl.style.display = 'block';
          }
          el.focus();
        }

        vars[k] = val;
      }

      if (hasError) return;

      overlay.remove();
      this.formOverlay = null;

      target.focus();
      try {
        if (!isTextControl && savedRange && window.getSelection) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        } else if (
          (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
          savedSelectionStart >= 0 &&
          savedSelectionEnd >= 0
        ) {
          target.setSelectionRange(savedSelectionStart, savedSelectionEnd);
        }
      } catch {}

      const rendered = this.renderSnippetWithContext(snippet.plainContent, vars, target);
      if (rendered.errors && rendered.errors.length > 0) {
        this.showErrorTooltip(target, rendered.errors.join('; '));
        return;
      }

      TextInserter.insert(target, {
        matchLength,
        replacementText: rendered.text,
        cursorOffset: rendered.cursorOffset
      });

      BrowserApi.sendMessage({ action: 'RECORD_USAGE', snippetId: snippet.id });
    };

    submitBtn.onclick = applyValues;

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.formOverlay = overlay;

    // Focus first input
    const firstInput = Object.values(inputs)[0];
    if (firstInput) firstInput.focus();

    // Keyboard handlers
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cancelAction();
      } else if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        applyValues();
      }
    });
  }

  /**
   * Compact Floating Keyboard Assistant with Range & Focus Preservation and Low-End Optimization (ST-014 & ST-020)
   */
  private openAssistant() {
    if (this.assistantOverlay) {
      this.assistantOverlay.remove();
      this.assistantOverlay = null;
      return;
    }

    // 1. Snapshot original active target AND Range/Selection before focus shifts (ST-014)
    const currentActive = DomDetector.getActiveElement();
    let originalTarget: HTMLElement | null = null;
    if (currentActive) {
      const inspected = DomDetector.inspectElement(currentActive);
      if (inspected.category !== 'none') {
        originalTarget = currentActive;
      }
    }
    if (!originalTarget && this.activeTarget) {
      const inspected = DomDetector.inspectElement(this.activeTarget);
      if (inspected.category !== 'none') {
        originalTarget = this.activeTarget;
      }
    }

    let savedRange: Range | null = null;
    let savedSelectionStart = -1;
    let savedSelectionEnd = -1;

    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
      if (originalTarget instanceof HTMLInputElement || originalTarget instanceof HTMLTextAreaElement) {
        savedSelectionStart = originalTarget.selectionStart ?? -1;
        savedSelectionEnd = originalTarget.selectionEnd ?? -1;
      }
    } catch {
      // Ignore selection snapshot error
    }

    const overlay = document.createElement('div');
    overlay.className = 'snaptype-assistant-overlay';

    const panel = document.createElement('div');
    panel.className = 'snaptype-assistant-panel';

    const assistantHead = document.createElement('div');
    assistantHead.className = 'snaptype-assistant-head';
    assistantHead.appendChild(createSnaptypeBrand());
    panel.appendChild(assistantHead);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'snaptype-assistant-search';
    searchInput.placeholder = 'Search snippets... (↑/↓ to navigate, Enter to insert)';
    panel.appendChild(searchInput);

    const listContainer = document.createElement('div');
    listContainer.className = 'snaptype-assistant-list';
    panel.appendChild(listContainer);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this.assistantOverlay = overlay;

    // Filter by allowed domain (ST-012)
    const hostname = window.location.hostname || '';
    const availableSnippets = this.snippets.filter((s) => isSnippetAllowedOnCurrentSite(s, hostname));

    let selectedIndex = 0;
    let filteredList: Snippet[] = [...availableSnippets];
    const MAX_RENDERED_ITEMS = 25; // ST-020: Memory optimization for low-end PCs

    const renderList = () => {
      listContainer.innerHTML = '';
      if (filteredList.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'snaptype-empty';
        emptyDiv.textContent = 'No matching snippets';
        listContainer.appendChild(emptyDiv);
        return;
      }

      const visibleSlice = filteredList.slice(0, MAX_RENDERED_ITEMS);

      visibleSlice.forEach((snip, idx) => {
        const item = document.createElement('div');
        item.className = `snaptype-assistant-item ${idx === selectedIndex ? 'selected' : ''}`;

        const titleEl = document.createElement('div');
        titleEl.className = 'snaptype-item-title';
        titleEl.textContent = snip.name;

        const shortcutEl = document.createElement('div');
        shortcutEl.className = 'snaptype-item-shortcut';
        shortcutEl.textContent = snip.shortcut;

        item.appendChild(titleEl);
        item.appendChild(shortcutEl);
        item.onclick = () => insertAssistantSnippet(snip);
        listContainer.appendChild(item);
      });

      if (filteredList.length > MAX_RENDERED_ITEMS) {
        const moreNotice = document.createElement('div');
        moreNotice.className = 'snaptype-assistant-more';
        moreNotice.textContent = `Showing 25 of ${filteredList.length} snippets. Type to filter...`;
        listContainer.appendChild(moreNotice);
      }
    };

    const insertAssistantSnippet = (snip: Snippet) => {
      overlay.remove();
      this.assistantOverlay = null;

      const target = originalTarget || this.activeTarget;
      if (!target || target === searchInput || !document.contains(target)) {
        return;
      }

      // Restore focus and precise Range/Caret position (ST-014)
      target.focus();
      const isTextControl = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      try {
        if (!isTextControl && savedRange && window.getSelection) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        } else if (
          (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
          savedSelectionStart >= 0 &&
          savedSelectionEnd >= 0
        ) {
          target.setSelectionRange(savedSelectionStart, savedSelectionEnd);
        }
      } catch {
        // Fallback to active focus
      }

      const dynamicFields = extractFormFields(snip.plainContent);
      if (dynamicFields.length > 0) {
        this.openDynamicForm(target, snip, dynamicFields, 0);
      } else {
        const rendered = this.renderSnippetWithContext(snip.plainContent, {}, target);
        if (rendered.errors && rendered.errors.length > 0) {
          this.showErrorTooltip(target, rendered.errors.join('; '));
          return;
        }
        TextInserter.insert(target, {
          matchLength: 0,
          replacementText: rendered.text,
          cursorOffset: rendered.cursorOffset
        });
        BrowserApi.sendMessage({ action: 'RECORD_USAGE', snippetId: snip.id });
      }
    };

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      if (!q) {
        filteredList = [...availableSnippets];
      } else {
        filteredList = availableSnippets.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.shortcut.toLowerCase().includes(q) ||
            s.plainContent.toLowerCase().includes(q)
        );
      }
      selectedIndex = 0;
      renderList();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const maxIdx = Math.min(filteredList.length - 1, MAX_RENDERED_ITEMS - 1);
        selectedIndex = Math.min(selectedIndex + 1, maxIdx);
        renderList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderList();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredList[selectedIndex]) {
          insertAssistantSnippet(filteredList[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        overlay.remove();
        this.assistantOverlay = null;
        if (originalTarget) originalTarget.focus();
      }
    });

    renderList();
    searchInput.focus();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.assistantOverlay = null;
      }
    });
  }
}

// Start content engine on idle
if (typeof document !== 'undefined') {
  new ContentEngine();
}
