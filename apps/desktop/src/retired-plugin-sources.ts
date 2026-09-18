/** One-time npm replacements for Aiko's four deleted public release repositories. */
import type { DesktopPluginRecord } from './market-project.ts'
import { lt, valid } from 'semver'

const marketBaseline = '1.39.0'
const replacements: Readonly<Record<string, { repository: string; version: string }>> = {
  'aiko-dsh-market': { repository: 'dsh-market', version: marketBaseline },
  'aiko-dsh-office': { repository: 'dsh-office', version: '0.3.1' },
  'aiko-dsh-bid-studio': { repository: 'dsh-bid-studio', version: '0.2.4' },
  'aiko-dsh-ontology-kernel': { repository: 'dsh-ontology-kernel', version: '0.1.5' },
}

/**
 * Resolve a retired, first-party artifact to its verified npm replacement.
 * @param plugin - Installed package and persisted source.
 * @returns Replacement record, or the original record for every other source.
 */
export function migrateRetiredPlugin(plugin: DesktopPluginRecord): DesktopPluginRecord {
  const name = plugin.name === 'dshmarket' ? 'aiko-dsh-market' : plugin.name
  const replacement = replacements[name]
  // Schema-2 directories require this market baseline, including profiles already on npm.
  if (plugin.name === 'aiko-dsh-market' && plugin.spec === `${plugin.name}@${plugin.version}`
    && valid(plugin.version) !== null && lt(plugin.version, marketBaseline)) {
    return { name, version: marketBaseline, spec: `${name}@${marketBaseline}` }
  }
  if (replacement === undefined || !plugin.spec.startsWith(`${plugin.name}@https://`)) return plugin
  const url = new URL(plugin.spec.slice(plugin.name.length + 1))
  const parts = url.pathname.split('/')
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash
    || parts.length !== 7 || parts[1] !== 'aiko-dsh-plugins' || parts[2] !== replacement.repository
    || parts[3] !== 'releases' || parts[4] !== 'download'
    || !(parts[6]?.startsWith(`${name}-`) || (name === 'aiko-dsh-market' && parts[6] === 'market.tgz'))
    || !parts[6].endsWith('.tgz')) return plugin
  return { name, version: replacement.version, spec: `${name}@${replacement.version}` }
}
