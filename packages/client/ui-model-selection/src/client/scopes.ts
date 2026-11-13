/**
 * Model scopes: a plugin groups several provider routes into one choice shown above
 * the composer's model list (for example, the billing project a conversation is
 * charged to). With two or more scopes the model pane lists the scopes first, each
 * with an optional detail such as remaining credit, and below them only the routes
 * of the scope in use; routes no source owns are always listed. The registry is
 * client-only presentation: selection still submits a plain provider/model pair.
 */
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** One scope a source puts provider routes into. */
export interface ModelScope {
  /** Stable scope identity; routes with the same id belong to the same scope. */
  readonly id: string
  /** Scope row name. */
  readonly name: string
  /** Secondary text at the row's end (for example remaining credit). */
  readonly detail?: string
}

/** A plugin's grouping of provider routes into scopes. */
export interface ModelScopeSource {
  /** Heading above the scope rows. */
  readonly label: string
  /**
   * The scope a provider route belongs to.
   * @param provider - provider identity and display name.
   * @returns the scope, or undefined when this source does not own the route.
   */
  scopeOf(provider: { readonly id: string; readonly name: string }): ModelScope | undefined
  /**
   * Heading for an owned route's models below the scope rows.
   * @param provider - provider identity and display name.
   * @returns the heading, or undefined to keep the provider name.
   */
  groupName?(provider: { readonly id: string; readonly name: string }): string | undefined
}

/** Registry of scope sources; the most recently registered source decides. */
export class ModelScopes {
  private readonly state: SnapshotStore<readonly ModelScopeSource[]> = createSnapshotStore<readonly ModelScopeSource[]>([])

  /** The registered sources, oldest first. */
  get store(): ObservableSnapshot<readonly ModelScopeSource[]> {
    return this.state
  }

  /**
   * Register a scope source.
   * @param source - the grouping; register a new object to change its scopes or details.
   * @returns a disposer that removes this source.
   */
  register(source: ModelScopeSource): () => void {
    this.state.set([...this.state.getSnapshot(), source])
    return () => { this.state.set(this.state.getSnapshot().filter(item => item !== source)) }
  }
}

/** A provider group as the menu shows it, with the scope it belongs to. */
export interface ScopedGroup<G> {
  readonly group: G
  readonly scope: ModelScope | undefined
  readonly heading: string
}

/** What the model pane shows for a set of scoped groups. */
export interface ScopeView<G> {
  /** Heading above the scope rows; undefined when fewer than two scopes exist. */
  readonly label: string | undefined
  /** Distinct scopes in catalog order (empty when fewer than two). */
  readonly scopes: readonly ModelScope[]
  /** The scope in use: the current selection's, else the first. */
  readonly active: string | undefined
  /** Groups to list: unowned ones and the active scope's. */
  readonly groups: readonly ScopedGroup<G>[]
}

/**
 * Resolve the scope rows and the visible groups.
 * @param groups - provider groups in menu order.
 * @param source - the deciding source, if any.
 * @param currentProvider - the selected provider route, if any.
 * @returns the scopes to offer and the groups to list.
 */
export function scopeView<G extends { readonly provider: { readonly id: string; readonly name: string } }>(
  groups: readonly G[], source: ModelScopeSource | undefined, currentProvider: string | undefined,
): ScopeView<G> {
  const scoped = groups.map((group): ScopedGroup<G> => {
    const scope = source?.scopeOf(group.provider)
    return { group, scope, heading: (scope === undefined ? undefined : source?.groupName?.(group.provider)) ?? group.provider.name }
  })
  const scopes: ModelScope[] = []
  for (const item of scoped) {
    if (item.scope !== undefined && !scopes.some(scope => scope.id === item.scope?.id)) scopes.push(item.scope)
  }
  if (scopes.length < 2) {
    // A single scope needs no choice; its routes keep their own names.
    const groups = scoped.map(item => ({ ...item, heading: item.group.provider.name }))
    return { label: undefined, scopes: [], active: scopes[0]?.id, groups }
  }
  const active = scoped.find(item => item.group.provider.id === currentProvider)?.scope?.id ?? scopes[0]?.id
  return {
    label: source?.label,
    scopes,
    active,
    groups: scoped.filter(item => item.scope === undefined || item.scope.id === active),
  }
}
