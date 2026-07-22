import { PLUGIN_NAME } from './constants';

let currentDisplayName = PLUGIN_NAME;

export function setDisplayName(name: string | undefined): void {
  currentDisplayName = name?.trim() || PLUGIN_NAME;
}

export function getDisplayName(): string {
  return currentDisplayName;
}

/** Prefix a message with `[displayName]`. */
export function brand(message: string): string {
  return `[${currentDisplayName}] ${message}`;
}
