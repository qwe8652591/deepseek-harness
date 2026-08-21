/** Package-owned invariant companion. @module @deepseek-ai/dsh-ontology-remote/invariant */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-ontology-remote'
/** Cordis companion plugin name. */
export const name = 'ontology-remote-invariant'
/** Services required before reserving package ownership. */
export const inject = ['invariants']
// No runtime invariant: every method delegates directly to the injected
// authoritative Provider and publishes no companion event or mutable state.
const install: InvariantInstaller = Object.assign(() => {}, { inject: ['ontologyRemote'] })
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
