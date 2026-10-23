/**
 * `desktopViews`: Host plugins drive the Electron shell's offscreen pages — a copy of the application page (`client`)
 * and a website page with its own storage (`web`). This service only forwards requests; tools, user approval and
 * which operations an agent may run belong to the plugin that uses it. Requests and answers are described in
 * `apps/desktop/src/client-view.ts`.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ClientViewChannel } from './client-view-channel.ts'

/** Which offscreen page a request addresses. */
export type DesktopViewKind = 'client' | 'web'

/** The Host side of the shell's offscreen pages. */
export interface DesktopViews {
  /**
   * Run one operation in an offscreen page.
   * @param view - `client` (copy of the application page) or `web` (website page).
   * @param request - operation and its fields, e.g. `{ op: 'open', width: 1440, height: 900 }`; the shell validates it.
   * @returns the shell's answer (`{ op, page }`, plus `png` for `shot`); rejects with the shell's message.
   */
  request(view: DesktopViewKind, request: Record<string, unknown>): Promise<unknown>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Offscreen client and website pages of the desktop shell; absent outside the desktop application. */
    desktopViews: DesktopViews
  }
}

/**
 * Provide `desktopViews` and close both pages when the Host context is disposed.
 * @param ctx - booted Desktop profile context.
 * @param channel - private request channel to the shell.
 */
export function provideDesktopViews(ctx: Context, channel: ClientViewChannel): void {
  const views: DesktopViews = {
    request: (view, request) => channel.request({ ...request, view }),
  }
  ctx.provide('desktopViews', views)
  ctx.effect(() => () => {
    for (const view of ['client', 'web'] as const) void channel.request({ op: 'close', view }).catch(() => undefined)
  }, 'desktop views: close on dispose')
}
