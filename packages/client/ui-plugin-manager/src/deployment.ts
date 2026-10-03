/** Public installation policy embedded by the Host for the plugin page. */
import z from '@deepseek-ai/schemastery'

/** Package controls and application-supplied bundles shown on the plugin page. */
export interface Deployment {
  /** Whether the page offers individual package installation and removal. */
  packageChanges: boolean
  /** Application-supplied bundles shown alongside profile-installed bundles. */
  bundledPackages: string[]
}

/** Validate the public page bootstrap and default ordinary profiles to package management. */
export const Deployment: z<Partial<Deployment>, Deployment> = z.object({
  packageChanges: z.boolean().default(true),
  bundledPackages: z.array(z.string()).default([]),
})
