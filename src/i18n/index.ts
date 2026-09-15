import { useSyncExternalStore } from 'react';
import english from './en.json';
export type Language = 'nl' | 'en';
const storageKey = 'matchday:language';
let language: Language = 'nl';
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey) === 'en')
    language = 'en';
} catch {
  /* Language switching also works without browser storage. */
}
const listeners = new Set<() => void>();
const dictionary: Record<string, string> = english;
const translated = new Map<string, string>();
const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();
const patterns = Object.entries(dictionary)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, value]) => {
    const slots: string[] = [];
    const parts = key.split(/(\{\d+\})/g).map((part) => {
      if (/^\{\d+\}$/.test(part)) {
        slots.push(part);
        return '(.*?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return { expression: new RegExp(`^${parts.join('')}$`), value, slots };
  });
function translateText(text: string, depth = 0): string {
  const key = normalise(text);
  if (!key) return text;
  const exact = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  let result = exact;
  if (result === undefined && depth < 4) {
    for (const pattern of patterns) {
      const match = pattern.expression.exec(key);
      if (!match) continue;
      result = pattern.value.replace(/\{\d+\}/g, (slot) =>
        translateText(match[pattern.slots.indexOf(slot) + 1] ?? '', depth + 1),
      );
      break;
    }
  }
  if (result === undefined && depth < 4) {
    // Source messages can concatenate independently translated sentences.
    const pieces = key.split(/(?<=[.!?])\s+(?=[A-Z])|(?<=;)\s+/);
    if (pieces.length > 1)
      result = pieces.map((piece) => translateText(piece, depth + 1)).join(' ');
  }
  if (result === undefined) return text;
  return `${text.match(/^\s*/)?.[0] ?? ''}${result}${text.match(/\s*$/)?.[0] ?? ''}`;
}
/** Translate presentation text only. Identifiers, API payloads and saved records stay unchanged. */
export function t<T>(value: T): T {
  if (language !== 'en' || typeof value !== 'string' || value.length > 2000) return value;
  let result = translated.get(value);
  if (result === undefined) {
    result = translateText(value);
    if (translated.size >= 2000) translated.clear();
    translated.set(value, result);
  }
  return result as T;
}
export const locale = () => (language === 'en' ? 'en-GB' : 'nl-BE');
export function setLanguage(next: Language) {
  if (next !== 'nl' && next !== 'en') return;
  language = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    /* Session-only preference. */
  }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLanguage() {
  return useSyncExternalStore(
    subscribe,
    () => language,
    () => 'nl' as Language,
  );
}

/** Interpolate translated copy explicitly; never parse values or change their identities. */
export function tr(key: string, values: unknown[]): string {
  return t(key).replace(/\{(\d+)\}/g, (_, index: string) => String(t(values[Number(index)] ?? '')));
}
