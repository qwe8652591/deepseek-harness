/** Restart requested by the product page, for example after a plugin update that only takes effect once the Host restarts. */

import type { MessageBoxOptions } from 'electron'

/** Longest caller reason shown in the dialog; longer or empty reasons fall back to the default text. */
const REASON_LIMIT = 300

/** Dialog texts, taken from the Desktop locale. */
export interface RestartRequestMessages {
  readonly restartRequestTitle: string
  readonly restartRequestDefault: string
  readonly restartRequestNow: string
  readonly restartRequestLater: string
}

/**
 * Ask the user whether to restart now. The page only asks; restarting always needs the user's answer here.
 * @param options.show - shows the native message box and resolves with the chosen button index.
 * @param options.messages - dialog texts in the current locale.
 * @param options.reason - caller's one-line reason; untrusted, so only a short non-empty string is shown.
 * @returns whether the user chose to restart now.
 */
export async function confirmRestart(options: {
  readonly show: (box: MessageBoxOptions) => Promise<{ readonly response: number }>
  readonly messages: RestartRequestMessages
  readonly reason: unknown
}): Promise<boolean> {
  const { show, messages, reason } = options
  const text = typeof reason === 'string' && reason.trim() !== '' && reason.length <= REASON_LIMIT ? reason.trim() : messages.restartRequestDefault
  const { response } = await show({
    type: 'question',
    title: messages.restartRequestTitle,
    message: text,
    buttons: [messages.restartRequestNow, messages.restartRequestLater],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  return response === 0
}
