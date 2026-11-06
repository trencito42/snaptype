import { ReverseShortcutMatcher, renderSnippet, extractFormFields } from '@snaptype/snippet-engine';
import { DomDetector, TextInserter, BrowserApi } from '@snaptype/browser-compat';
import { Snippet, UserPreferences, DEFAULT_PREFERENCES, DynamicFormField } from '@snaptype/shared';

class ContentEngine {
  private matcher: ReverseShortcutMatcher = new ReverseShortcutMatcher();
  private snippets: Snippet[] = [];
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
    // 1. Fetch synced snippets and preferences from background
    await this.refreshData();

    // 2. Check domain exclusion
    const hostname = window.location.hostname || '';
    if (DomDetector.isExcludedDomain(hostname, this.preferences.excludedDomains)) {
      this.isExcluded = true;
      return;
    }

    // 3. Attach global listeners
    this.attachEventListeners();
  }

  private async refreshData() {
    try {
      const response = await BrowserApi.sendMessage({ action: 'GET_DATA' });
      if (response && response.snippets) {
        this.snippets = response.snippets;
        this.preferences = response.preferences || this.preferences;
        this.matcher.rebuild(this.snippets, this.preferences.caseSensitive);
      }
    } catch {
      // background service worker might be cold-starting
    }
  }

  private attachEventListeners() {
    // Track active element and clear buffer on selection/focus change
    document.addEventListener('focusin', (e) => {
      this.activeTarget = e.target as HTMLElement;
      this.keystrokeBuffer = '';
    }, true);

    document.addEventListener('click', (e) => {
      // If clicking outside assistant or form, clear buffer
      this.keystrokeBuffer = '';
    }, true);

    // Keystroke listening
    document.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
    document.addEventListener('input', (e) => this.handleInput(e), true);

    // Runtime messages from background (e.g. open assistant hotkey or context menu)
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'OPEN_ASSISTANT') {
          this.openAssistant();
        }
        if (message.action === 'REFRESH_DATA') {
          this.refreshData();
        }
      });
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.isExcluded) return;

    // Check Assistant hotkey: Ctrl+Shift+Space (or configured hotkey)
    if (e.ctrlKey && e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
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

    // We found a matching shortcut!
    this.keystrokeBuffer = ''; // Reset buffer to prevent re-triggering

    const snippet = match.snippet;
    const dynamicFields = extractFormFields(snippet.plainContent);

    if (dynamicFields.length > 0) {
      // Dynamic inputs required: open modal form dialog
      this.openDynamicForm(target, snippet, dynamicFields, match.matchLength);
    } else {
      // Plain/static replacement: insert immediately
      const rendered = renderSnippet(snippet.plainContent);
      TextInserter.insert(target, {
        matchLength: match.matchLength,
        replacementText: rendered.text,
        cursorOffset: rendered.cursorOffset
      });

      // Record usage asynchronously in background
      BrowserApi.sendMessage({ action: 'RECORD_USAGE', snippetId: snippet.id });
    }
  }

  /**
   * Interactive Dynamic Form Dialog
   */
  private openDynamicForm(target: HTMLElement, snippet: Snippet, fields: DynamicFormField[], matchLength: number) {
    if (this.formOverlay) this.formOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'snaptype-overlay';

    const modal = document.createElement('div');
    modal.className = 'snaptype-modal';

    const header = document.createElement('div');
    header.className = 'snaptype-modal-header';
    header.innerHTML = `<strong>${snippet.name}</strong> <span class="snaptype-badge">${snippet.shortcut}</span>`;
    modal.appendChild(header);

    const form = document.createElement('div');
    form.className = 'snaptype-form-body';

    const inputs: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};

    for (const field of fields) {
      const row = document.createElement('div');
      row.className = 'snaptype-form-row';

      const label = document.createElement('label');
      label.textContent = field.label || field.name;
      row.appendChild(label);

      let inputEl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

      if (field.type === 'dropdown') {
        const select = document.createElement('select');
        select.className = 'snaptype-input';
        for (const opt of field.options || []) {
          const optEl = document.createElement('option');
          optEl.value = opt;
          optEl.textContent = opt;
          select.appendChild(optEl);
        }
        inputEl = select;
      } else if (field.type === 'paragraph') {
        const ta = document.createElement('textarea');
        ta.className = 'snaptype-input';
        ta.rows = 3;
        ta.value = String(field.defaultValue || '');
        inputEl = ta;
      } else {
        const inp = document.createElement('input');
        inp.className = 'snaptype-input';
        inp.type = field.type === 'date' ? 'date' : 'text';
        inp.value = String(field.defaultValue || '');
        inputEl = inp;
      }

      inputs[field.name] = inputEl;
      row.appendChild(inputEl);
      form.appendChild(row);
    }

    modal.appendChild(form);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'snaptype-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'snaptype-btn snaptype-btn-secondary';
    cancelBtn.textContent = 'Cancel (Esc)';
    cancelBtn.onclick = () => overlay.remove();

    const submitBtn = document.createElement('button');
    submitBtn.className = 'snaptype-btn snaptype-btn-primary';
    submitBtn.textContent = 'Insert Snippet (Enter)';

    const applyValues = () => {
      const vars: Record<string, any> = {};
      for (const [k, el] of Object.entries(inputs)) {
        vars[k] = el.value;
      }
      overlay.remove();

      const rendered = renderSnippet(snippet.plainContent, { variables: vars });
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
        overlay.remove();
        target.focus();
      } else if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        applyValues();
      }
    });
  }

  /**
   * Compact Floating Keyboard Assistant
   */
  private openAssistant() {
    if (this.assistantOverlay) {
      this.assistantOverlay.remove();
      this.assistantOverlay = null;
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'snaptype-assistant-overlay';

    const panel = document.createElement('div');
    panel.className = 'snaptype-assistant-panel';

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

    let selectedIndex = 0;
    let filteredList: Snippet[] = [...this.snippets];

    const renderList = () => {
      listContainer.innerHTML = '';
      if (filteredList.length === 0) {
        listContainer.innerHTML = '<div class="snaptype-empty">No matching snippets</div>';
        return;
      }

      filteredList.forEach((snip, idx) => {
        const item = document.createElement('div');
        item.className = `snaptype-assistant-item ${idx === selectedIndex ? 'selected' : ''}`;
        item.innerHTML = `
          <div class="snaptype-item-title">${snip.name}</div>
          <div class="snaptype-item-shortcut">${snip.shortcut}</div>
        `;
        item.onclick = () => insertAssistantSnippet(snip);
        listContainer.appendChild(item);
      });
    };

    const insertAssistantSnippet = (snip: Snippet) => {
      overlay.remove();
      this.assistantOverlay = null;

      const target = this.activeTarget || (DomDetector.getActiveElement() as HTMLElement);
      if (!target) return;

      const dynamicFields = extractFormFields(snip.plainContent);
      if (dynamicFields.length > 0) {
        this.openDynamicForm(target, snip, dynamicFields, 0);
      } else {
        const rendered = renderSnippet(snip.plainContent);
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
        filteredList = [...this.snippets];
      } else {
        filteredList = this.snippets.filter((s) =>
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
        selectedIndex = Math.min(selectedIndex + 1, filteredList.length - 1);
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
        if (this.activeTarget) this.activeTarget.focus();
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
