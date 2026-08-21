/** Package-owned invariant companion. @module @deepseek-ai/dsh-ontology/invariant */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-ontology'
/** Cordis companion plugin name. */
export const name = 'ontology-invariant'
/** Services required before reserving package ownership. */
export const inject = ['invariants']
// No runtime invariant: this package only declares the Service Definition;
// each Provider owns the mutable relationships behind that interface.
const install: InvariantInstaller = () => {}
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
