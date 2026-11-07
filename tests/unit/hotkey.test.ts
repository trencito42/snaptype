import { describe, it, expect } from 'vitest';
import { comboFromEvent, RESERVED_COMBOS } from '../../apps/web/src/utils/hotkey.js';

const ev = (o: Partial<Parameters<typeof comboFromEvent>[0]>) => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });

describe('hotkey recorder', () => {
  it('records a modifier + Space combination in the format the extension parses', () => {
    expect(comboFromEvent(ev({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true }))).toEqual({ combo: 'Ctrl+Shift+Space', complete: true });
  });
  it('uses the physical key so Shift+digit and layouts do not break it', () => {
    expect(comboFromEvent(ev({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })).combo).toBe('Ctrl+Shift+1');
    expect(comboFromEvent(ev({ key: 'k', code: 'KeyK', altKey: true })).combo).toBe('Alt+K');
  });
  it('shows modifiers live but is not complete until a real key is pressed', () => {
    expect(comboFromEvent(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toEqual({ combo: 'Ctrl', complete: false });
    expect(comboFromEvent(ev({ key: 'Shift', code: 'ShiftLeft', ctrlKey: true, shiftKey: true }))).toEqual({ combo: 'Ctrl+Shift', complete: false });
  });
  it('supports function and navigation keys and the Meta key', () => {
    expect(comboFromEvent(ev({ key: 'F2', code: 'F2', altKey: true })).combo).toBe('Alt+F2');
    expect(comboFromEvent(ev({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true })).combo).toBe('Meta+ArrowUp');
  });
  it('flags combinations owned by the browser', () => {
    expect(RESERVED_COMBOS.has('Ctrl+T')).toBe(true);
    expect(RESERVED_COMBOS.has('Ctrl+Shift+Space')).toBe(false);
  });
});
