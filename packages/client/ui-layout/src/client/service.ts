/**
 * LayoutController: the cross-plugin panel and application-navigation face
 * behind ctx.layout.
 * Panel geometry itself lives in the root entry's layout store (stores.ts);
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (sidebar toggle from ui-sidebar,
 * details open/close from ui-conversation) — writes stay inside the store's
 * declared action set, delivered as the registration's bound actions.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore } from './stores.ts'

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/**
 * The outward layout face (`ctx.layout`): the panel transitions other
 * plugins may trigger — and exactly what a test fake must supply. The
 * attachPanels wiring hook stays on the concrete class (root-entry assembly
 * only).
 */
export interface ILayout {
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /** Open the details panel (no-op when already open). */
  openDetails(): void
  /** Close the details panel. */
  closeDetails(): void
  /** Open a registered application page by its keyed slot id. */
  openApplication(applicationId: string): void
  /** Return from an application page to the conversation surface. */
  closeApplication(): void
  /** Current application-navigation snapshot. */
  getSnapshot(): ApplicationNavigationSnapshot
  /** Observe application-navigation changes. */
  subscribe(listener: () => void): () => void
}

/** Immutable viewing state shared by the frame and application menu entries. */
export interface ApplicationNavigationSnapshot {
  /** Key of the active `application` slot entry; absent means conversation. */
  readonly activeApplication?: string
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  #panels: PanelActions | undefined
  #snapshot: ApplicationNavigationSnapshot = {}
  readonly #listeners = new Set<() => void>()

  /**
   * Adopt the root entry's bound store actions. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render; on entry re-register the
   * fresh actions overwrite the stale set.
   * @param actions - bound actions of the entry's layout store instance.
   */
  attachPanels(actions: PanelActions): void {
    this.#panels = actions
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.#require().toggleSidebar()
  }

  /** Open the details panel (no-op when already open). */
  openDetails(): void {
    this.#require().openDetails()
  }

  /** Close the details panel. */
  closeDetails(): void {
    this.#require().closeDetails()
  }

  /** Open a registered application page by its keyed slot id. */
  openApplication(applicationId: string): void {
    if (applicationId.length === 0 || applicationId !== applicationId.trim()) {
      throw new Error('layout: application id must be a non-empty normalized string')
    }
    if (this.#snapshot.activeApplication === applicationId) return
    this.#snapshot = { activeApplication: applicationId }
    this.#notify()
  }

  /** Return from an application page to the conversation surface. */
  closeApplication(): void {
    if (this.#snapshot.activeApplication === undefined) return
    this.#snapshot = {}
    this.#notify()
  }

  /** Current immutable navigation snapshot. */
  getSnapshot(): ApplicationNavigationSnapshot {
    return this.#snapshot
  }

  /** Observe application-navigation changes. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener()
  }

  #require(): PanelActions {
    // Callers are UI gestures, which cannot fire before the root entry
    // rendered (the inject hook runs in its first render) — reaching this
    // unwired is a boot-order bug, not a race to tolerate.
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }
}
