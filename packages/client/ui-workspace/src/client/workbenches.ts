/** Workbench destinations and preset membership over the native Session list. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** A plugin selects a native Session group or its own registered main panel. */
export type WorkspaceWorkbench = {
  /** Stable plugin-owned name, also used by the sidebar tab registration. */
  id: string
} & ({
  /** Group native Sessions by their durable Agent preset. */
  kind: 'sessions'
  /** Preset selected when this workbench creates a Session. */
  defaultPreset: string
  /** Additional presets whose Sessions belong to this workbench. */
  presets?: readonly string[]
  /** Initialize an empty native Session, preserving any existing workbench choices. */
  prepareSession?: (sessionId: SessionId) => Promise<void>
} | {
  /** Open a plugin-owned document or other specialized main panel. */
  kind: 'panel'
  /** Key registered in the main slot; selecting it does not create a Session. */
  panel: MainPanelId
})

/** Selected workbench; null uses the native default workspace view. */
export interface WorkspaceWorkbenchSelection { active: string | null }

/** Keeps filtering independent of Session ownership and conversation rendering. */
export class WorkspaceWorkbenches {
  /** Selected workbench key observed by sidebar tabs. */
  readonly selection = createSnapshotStore<WorkspaceWorkbenchSelection>({ active: null })
  /** Filtered list; Session objects and persistence remain owned by the controller. */
  readonly sessions: ReturnType<typeof createSnapshotStore<SessionListState>>
  private readonly definitions = new Map<string, WorkspaceWorkbench>()
  private readonly remembered = new Map<string | null, SessionId>()
  private observed: { id: SessionId | undefined; owner: string | null } | undefined

  /** @param source - Unfiltered native Session list. */
  constructor(private readonly source: ObservableSnapshot<SessionListState>) {
    this.sessions = createSnapshotStore(source.getSnapshot())
  }

  /** Register a destination with exclusive native preset membership when applicable.
   * @param definition - Plugin panel or native Session defaults.
   * @returns Disposer releasing its presets and returning an active view to Cowork.
   */
  register(definition: WorkspaceWorkbench): () => void {
    if (this.definitions.has(definition.id)) throw new Error(`workbench already registered: ${definition.id}`)
    if (definition.kind === 'sessions') {
      const claimed = new Set([definition.defaultPreset, ...definition.presets ?? []])
      for (const existing of this.definitions.values()) {
        if (existing.kind === 'sessions'
          && [existing.defaultPreset, ...existing.presets ?? []].some(preset => claimed.has(preset))) {
          throw new Error(`workbench preset already registered: ${definition.defaultPreset}`)
        }
      }
    }
    this.definitions.set(definition.id, definition)
    this.sync()
    return () => {
      this.definitions.delete(definition.id)
      if (this.selection.getSnapshot().active === definition.id) this.setActive(null)
      this.sync()
    }
  }

  /** Resolve the preset for creation.
   * @returns Selected workbench preset, or the Host default for Cowork.
   */
  defaultPreset(): string | undefined {
    const definition = this.selected()
    return definition?.kind === 'sessions' ? definition.defaultPreset : undefined
  }

  /** Resolve initialization for an empty Session.
   * @returns Selected workbench initializer, if any.
   */
  prepareSession(): Extract<WorkspaceWorkbench, { kind: 'sessions' }>['prepareSession'] {
    const definition = this.selected()
    return definition?.kind === 'sessions' ? definition.prepareSession : undefined
  }

  /** Resolve the selected plugin panel.
   * @returns Main slot key, or undefined for a native Session workbench.
   */
  panel(): MainPanelId | undefined {
    const definition = this.selected()
    return definition?.kind === 'panel' ? definition.panel : undefined
  }

  /** Resolve membership from the persisted preset.
   * @param summary - Native Session summary.
   * @returns Registered workbench key, or null for Cowork.
   */
  owner(summary: SessionSummary): string | null {
    const preset = summary.projectionValues?.agentPreset
    for (const definition of this.definitions.values()) {
      if (definition.kind === 'sessions' && (preset === definition.defaultPreset
        || (preset !== undefined && preset !== null && definition.presets?.includes(preset)))) return definition.id
    }
    return null
  }

  /** Check visibility in the selected workbench.
   * @param summary - Native Session summary.
   * @returns Whether it belongs to the selected workbench.
   */
  contains(summary: SessionSummary): boolean {
    return this.owner(summary) === this.selection.getSnapshot().active
  }

  /** Resolve remembered selection.
   * @param id - Workbench key.
   * @returns Last selected Session during this browser lifetime.
   */
  previous(id: string | null): SessionId | undefined { return this.remembered.get(id) }

  /** Select a registered workbench and publish its filtered list.
   * @param id - Registered workbench key, or null for Cowork.
   */
  setActive(id: string | null): void {
    if (id !== null && !this.definitions.has(id)) throw new Error(`unknown workbench: ${id}`)
    if (this.selection.getSnapshot().active !== id) this.selection.set({ active: id })
    this.publish()
  }

  /** Reconcile membership and remembered selection after a native list update. */
  sync(): void {
    const list = this.source.getSnapshot()
    const current = list.current === undefined ? undefined : list.byId[list.current]
    const owner = current === undefined ? null : this.owner(current)
    if (this.observed?.id !== list.current || this.observed?.owner !== owner) {
      this.observed = { id: list.current, owner }
      if (current !== undefined) {
        this.remembered.set(owner, current.id)
        if (this.panel() === undefined && this.selection.getSnapshot().active !== owner) this.selection.set({ active: owner })
      }
    }
    this.publish()
  }

  private selected(): WorkspaceWorkbench | undefined {
    const active = this.selection.getSnapshot().active
    return active === null ? undefined : this.definitions.get(active)
  }

  private publish(): void {
    const list = this.source.getSnapshot()
    if (this.definitions.size === 0) { this.sessions.set(list); return }
    const byId = Object.fromEntries(Object.entries(list.byId).filter(([, summary]) => this.contains(summary)))
    this.sessions.set({ ...list, byId, ids: list.ids.filter(id => byId[id] !== undefined) })
  }
}
