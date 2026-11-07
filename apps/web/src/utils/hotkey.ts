// Pure helpers for the hotkey recorder (unit tested).
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph']);
/** Combinations the browser or OS already owns; recording them would silently never work. */
export const RESERVED_COMBOS = new Set(['Ctrl+T', 'Ctrl+W', 'Ctrl+N', 'Ctrl+R', 'Ctrl+L', 'Ctrl+F', 'Ctrl+P', 'Ctrl+S', 'Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Alt+F4', 'Ctrl+Tab']);

/** Turns a keydown event into the same string format the extension understands ("Ctrl+Shift+Space"). */
export function comboFromEvent(e: { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): { combo: string; complete: boolean } {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  if (MODIFIER_KEYS.has(e.key)) return { combo: mods.join('+'), complete: false };
  let key: string;
  if (e.code === 'Space') key = 'Space';
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (e.key.length === 1) key = e.key.toUpperCase();
  else key = e.key; // F1, ArrowUp, Enter, Tab, ...
  return { combo: [...mods, key].join('+'), complete: true };
}

