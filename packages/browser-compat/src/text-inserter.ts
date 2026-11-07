import { DomDetector, EditableCategory } from './dom-detector.js';

export interface InsertionOptions {
  matchLength: number; // characters to erase backwards from caret
  replacementText: string;
  cursorOffset?: number; // relative cursor offset inside replacementText (-1 = at end)
}

export class TextInserter {
  /**
   * Guard flag preventing SnapType's own synthetic events from retriggering keystroke buffers (ST-016)
   */
  public static isProgrammaticInsert: boolean = false;

  /**
   * Dispatches synthetic events expected by React, Vue, Angular, etc.
   */
  private static dispatchInputEvents(element: HTMLElement, insertedText: string): void {
    try {
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertReplacementText',
        data: insertedText
      });
      (beforeInputEvent as any).__snaptype_synthetic = true;
      element.dispatchEvent(beforeInputEvent);
    } catch {
      // InputEvent might be restricted in some browser contexts
    }

    try {
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertReplacementText',
        data: insertedText
      });
      (inputEvent as any).__snaptype_synthetic = true;
      element.dispatchEvent(inputEvent);
    } catch {
      const fallbackEvent = new Event('input', { bubbles: true, composed: true });
      (fallbackEvent as any).__snaptype_synthetic = true;
      element.dispatchEvent(fallbackEvent);
    }

    const changeEvent = new Event('change', { bubbles: true });
    (changeEvent as any).__snaptype_synthetic = true;
    element.dispatchEvent(changeEvent);
  }

  /**
   * Insert text into standard HTMLInputElement or HTMLTextAreaElement
   */
  public static insertIntoInput(
    element: HTMLInputElement | HTMLTextAreaElement,
    options: InsertionOptions
  ): boolean {
    const { matchLength, replacementText, cursorOffset = -1 } = options;
    const currentEnd = element.selectionEnd ?? element.value.length;
    const replaceStart = Math.max(0, currentEnd - matchLength);

    // Focus if not currently active
    if (document.activeElement !== element) {
      element.focus();
    }

    // Set selection over the shortcut to be replaced
    element.setSelectionRange(replaceStart, currentEnd);

    let replacedViaExec = false;

    // 1. Try native execCommand for proper browser undo stack
    try {
      replacedViaExec = document.execCommand('insertText', false, replacementText);
    } catch {
      replacedViaExec = false;
    }

    // 2. Fallback to direct value replacement with framework property descriptor
    if (!replacedViaExec) {
      const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

      const fullVal = element.value;
      const newVal = fullVal.slice(0, replaceStart) + replacementText + fullVal.slice(currentEnd);

      if (valueSetter) {
        valueSetter.call(element, newVal);
      } else {
        element.value = newVal;
      }
    }

    // 3. Set desired cursor position
    let finalCaretPos = replaceStart + replacementText.length;
    if (cursorOffset >= 0 && cursorOffset <= replacementText.length) {
      finalCaretPos = replaceStart + cursorOffset;
    }
    element.setSelectionRange(finalCaretPos, finalCaretPos);

    // 4. Dispatch input events so reactive frameworks update their internal model
    this.dispatchInputEvents(element, replacementText);

    return true;
  }

  /**
   * Insert text into contenteditable elements
   */
  public static insertIntoContentEditable(
    element: HTMLElement,
    options: InsertionOptions
  ): boolean {
    const { matchLength, replacementText, cursorOffset = -1 } = options;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return false;
    }

    const range = sel.getRangeAt(0);

    // If we need to delete characters backwards from cursor:
    if (matchLength > 0) {
      try {
        // Expand selection backward by matchLength characters
        for (let i = 0; i < matchLength; i++) {
          sel.modify('extend', 'backward', 'character');
        }
      } catch {
        // Fallback if sel.modify is not supported in some older contexts
      }
    }

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, replacementText);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      // Manual DOM fallback
      try {
        const activeRange = sel.getRangeAt(0);
        activeRange.deleteContents();
        const textNode = document.createTextNode(replacementText);
        activeRange.insertNode(textNode);

        // Position caret
        const newRange = document.createRange();
        if (cursorOffset >= 0 && cursorOffset <= replacementText.length) {
          newRange.setStart(textNode, cursorOffset);
          newRange.setEnd(textNode, cursorOffset);
        } else {
          newRange.setStartAfter(textNode);
          newRange.setEndAfter(textNode);
        }
        sel.removeAllRanges();
        sel.addRange(newRange);
        inserted = true;
      } catch {
        inserted = false;
      }
    }

    this.dispatchInputEvents(element, replacementText);
    return inserted;
  }

  /**
   * General entrypoint for inserting into any editable target
   */
  public static insert(element: HTMLElement, options: InsertionOptions): boolean {
    const inspected = DomDetector.inspectElement(element);

    if (inspected.isSensitive) {
      return false;
    }

    try {
      TextInserter.isProgrammaticInsert = true;

      if (inspected.category === 'input' || inspected.category === 'textarea') {
        return this.insertIntoInput(element as HTMLInputElement | HTMLTextAreaElement, options);
      }

      if (inspected.category === 'contenteditable') {
        return this.insertIntoContentEditable(element, options);
      }

      return false;
    } finally {
      // Clear programmatic flag asynchronously so microtasks/event loops complete
      setTimeout(() => {
        TextInserter.isProgrammaticInsert = false;
      }, 0);
    }
  }
}

