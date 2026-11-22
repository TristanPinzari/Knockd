/** Tiny logger so the app never calls console.log directly. Debug output is dev-only. */
type LogArgs = readonly unknown[];

const isDev = (): boolean => (globalThis as { __DEV__?: boolean }).__DEV__ === true;

export const logger = {
  debug: (message: string, ...args: LogArgs): void => {
    if (isDev()) console.debug(`[knockd] ${message}`, ...args);
  },
  warn: (message: string, ...args: LogArgs): void => {
    console.warn(`[knockd] ${message}`, ...args);
  },
  error: (message: string, ...args: LogArgs): void => {
    console.error(`[knockd] ${message}`, ...args);
  },
};
