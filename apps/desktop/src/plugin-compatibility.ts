/** Validate plugin-owned host and plugin version requirements before activation. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { satisfies, validRange } from 'semver'
import type { DesktopPluginRecord } from './market-project.ts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reject malformed or unsatisfied declarations in the staged installation.
 * @param projectDir - Isolated profile whose packages have been resolved.
 * @param hostVersion - Exact dsh release supplied by the desktop shell.
 * @param plugins - Complete staged plugin inventory.
 * @throws If a declared host or plugin requirement cannot be satisfied.
 */
export function assertPluginCompatibility(projectDir: string, hostVersion: string, plugins: readonly DesktopPluginRecord[]): void {
  const installed = new Map(plugins.map(plugin => [plugin.name, plugin.version]))
  for (const plugin of plugins) {
    const manifest: unknown = JSON.parse(readFileSync(join(projectDir, 'node_modules', ...plugin.name.split('/'), 'package.json'), 'utf8'))
    const dsh = record(manifest) && record(manifest.dsh) ? manifest.dsh : undefined
    const compatibility = dsh?.compatibility
    if (compatibility === undefined) continue
    if (!record(compatibility) || typeof compatibility.host !== 'string' || validRange(compatibility.host) === null) {
      throw new Error(`desktop project: ${plugin.name} has invalid dsh.compatibility.host`)
    }
    if (!satisfies(hostVersion, compatibility.host)) {
      throw new Error(`desktop project: ${plugin.name}@${plugin.version} requires Aiko DSH ${compatibility.host}; installed ${hostVersion}`)
    }
    if (compatibility.plugins === undefined) continue
    if (!record(compatibility.plugins)) throw new Error(`desktop project: ${plugin.name} has invalid plugin requirements`)
    for (const [name, range] of Object.entries(compatibility.plugins)) {
      if (typeof range !== 'string' || validRange(range) === null) throw new Error(`desktop project: ${plugin.name} has an invalid requirement for ${name}`)
      const version = installed.get(name)
      if (version === undefined || !satisfies(version, range)) {
        throw new Error(`desktop project: ${plugin.name} requires ${name}@${range}; installed ${version ?? 'none'}`)
      }
    }
  }
}
