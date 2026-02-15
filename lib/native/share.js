/**
 * Copy text to clipboard with fallback for WebView environments.
 *
 * @param {string} text
 * @returns {Promise<'copied' | 'failed'>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
}

/**
 * Share via native Capacitor Share plugin when running in a native app,
 * with fallback to Web Share API and then clipboard copy.
 *
 * @param {{ title?: string, text: string, url?: string }} options
 *   - title: share dialog title
 *   - text: share body text (e.g. "Join my trip on Tripti!")
 *   - url: link to share (appended to text for clipboard fallback)
 * @returns {Promise<'shared' | 'copied' | 'failed'>}
 */
export async function nativeShare({ title, text, url }) {
  // Build the full clipboard message (text + url on separate line)
  const clipboardText = url ? `${text}\n${url}` : text

  // 1. Try Capacitor Share plugin (native iOS/Android share sheet)
  const CapShare = window?.Capacitor?.Plugins?.Share
  if (CapShare) {
    try {
      await CapShare.share({
        title,
        text,
        url,
        dialogTitle: title,
      })
      return 'shared'
    } catch (err) {
      // User cancelled — not an error
      if (err?.message?.includes('cancel') || err?.code === 'UNIMPLEMENTED') {
        // fall through
      } else {
        return 'shared' // share sheet was shown
      }
    }
  }

  // 2. Try Web Share API (Safari, some browsers)
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'shared'
      // Fall through to clipboard
    }
  }

  // 3. Fallback: copy to clipboard
  return copyToClipboard(clipboardText)
}
