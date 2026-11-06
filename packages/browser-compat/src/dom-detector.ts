import { SENSITIVE_AUTOCOMPLETE_VALUES, SENSITIVE_INPUT_TYPES } from '@snaptype/shared';

export type EditableCategory = 'input' | 'textarea' | 'contenteditable' | 'none';

export interface EditableInfo {
  category: EditableCategory;
  element: HTMLElement;
  isSensitive: boolean;
}

export class DomDetector {
  public static getActiveElement(doc: Document = document): HTMLElement | null {
    let active = doc.activeElement as HTMLElement | null;
    // Drill into shadow roots if present
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement as HTMLElement;
    }
    return active;
  }

  public static isExcludedDomain(hostname: string, excludedDomains: string[] = []): boolean {
    const host = hostname.toLowerCase();
    for (const pattern of excludedDomains) {
      const p = pattern.toLowerCase().trim();
      if (!p) continue;
      if (host === p || host.endsWith('.' + p)) {
        return true;
      }
    }
    return false;
  }

  public static isSensitiveField(element: HTMLElement): boolean {
    if (element instanceof HTMLInputElement) {
      const type = (element.type || 'text').toLowerCase();
      if (SENSITIVE_INPUT_TYPES.has(type)) {
        return true;
      }

      const autocomplete = (element.autocomplete || '').toLowerCase();
      if (SENSITIVE_AUTOCOMPLETE_VALUES.has(autocomplete)) {
        return true;
      }

      // Check name, id, and class for sensitive patterns
      const idOrName = `${element.name} ${element.id} ${element.className}`.toLowerCase();
      if (
        idOrName.includes('password') ||
        idOrName.includes('passcode') ||
        idOrName.includes('creditcard') ||
        idOrName.includes('cvv') ||
        idOrName.includes('cvc') ||
        idOrName.includes('security-code') ||
        idOrName.includes('totp') ||
        idOrName.includes('otp')
      ) {
        return true;
      }
    }

    // Check data-attributes
    if (element.hasAttribute('data-sensitive') || element.getAttribute('data-private') === 'true') {
      return true;
    }

    return false;
  }

  public static inspectElement(element: HTMLElement | null): EditableInfo {
    if (!element) {
      return { category: 'none', element: document.body, isSensitive: false };
    }

    const isSensitive = this.isSensitiveField(element);

    if (element instanceof HTMLInputElement) {
      const type = (element.type || 'text').toLowerCase();
      // Only text-like inputs
      const textLike = ['text', 'search', 'url', 'email', 'tel', ''];
      if (textLike.includes(type) && !element.readOnly && !element.disabled) {
        return { category: 'input', element, isSensitive };
      }
      return { category: 'none', element, isSensitive };
    }

    if (element instanceof HTMLTextAreaElement) {
      if (!element.readOnly && !element.disabled) {
        return { category: 'textarea', element, isSensitive };
      }
      return { category: 'none', element, isSensitive };
    }

    // Check contenteditable
    const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';
    if (isContentEditable) {
      return { category: 'contenteditable', element, isSensitive };
    }

    return { category: 'none', element, isSensitive };
  }
}
