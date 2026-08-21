/** Package-owned invariant companion. @module @deepseek-ai/dsh-ontology-local/invariant */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-ontology-local'
/** Cordis companion plugin name. */
export const name = 'ontology-local-invariant'
/** Services required before reserving package ownership. */
export const inject = ['invariants']
// No runtime invariant: the Provider validates definitions and objects before
// publishing them and exposes no independent authoritative event stream to
// compare with its private maps.
const install: InvariantInstaller = Object.assign(() => {}, { inject: ['ontology'] })
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
