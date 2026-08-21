/** Package-owned invariant companion. @module @deepseek-ai/dsh-bid-studio-bundle/invariant */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-bid-studio-bundle'
/** Cordis companion plugin name. */
export const name = 'bid-studio-bundle-invariant'
/** Services required before reserving package ownership. */
export const inject = ['invariants']
// No runtime invariant: this package carries only a static patch list; each
// inserted plugin owns its runtime checks.
const install: InvariantInstaller = () => {}
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
