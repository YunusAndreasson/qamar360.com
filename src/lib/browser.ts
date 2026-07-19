import * as WebBrowser from 'expo-web-browser';

/**
 * Open a URL in the in-app browser, absorbing the rejection a fast double-tap raises on iOS
 * ("another WebBrowser is already being presented"): the first sheet is already up — which is
 * what the user wanted — so an unhandled rejection is all the second call could add.
 */
export function openBrowser(url: string): void {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}
