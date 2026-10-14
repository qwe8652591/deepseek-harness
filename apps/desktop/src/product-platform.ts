/** Editable platform endpoints; credentials and account homes are isolated by service origin. */
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** Public endpoints stored by the current OS user, without passwords or tokens. */
export interface ProductPlatform {
  readonly websiteOrigin: string
  readonly gatewayOrigin: string
}

/** Saved or entered endpoints need correction in the local settings form. */
export class ProductPlatformConfigurationError extends Error {
  constructor() { super('Invalid platform address') }
}

/**
 * Validate user-entered platform addresses, admitting HTTP only for local development.
 * @param input Values received from the settings renderer or its saved JSON file.
 * @returns Canonical origins; an omitted auth address uses the platform origin.
 */
export function parseProductPlatform(input: unknown): ProductPlatform {
  if (typeof input !== 'object' || input === null || !('websiteOrigin' in input) || typeof input.websiteOrigin !== 'string') throw new ProductPlatformConfigurationError()
  const origin = (value: unknown): string => {
    if (typeof value !== 'string') throw new ProductPlatformConfigurationError()
    let url: URL
    try { url = new URL(value.trim()) }
    catch { throw new ProductPlatformConfigurationError() }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new ProductPlatformConfigurationError()
    return url.origin
  }
  const websiteOrigin = origin(input.websiteOrigin)
  const gateway = 'gatewayOrigin' in input ? input.gatewayOrigin : undefined
  return { websiteOrigin, gatewayOrigin: gateway === undefined || gateway === '' ? websiteOrigin : origin(gateway) }
}

/**
 * Read a saved public connection without consuming or changing its account credential.
 * @param userData Stable brand-owned user-data directory.
 * @returns Saved connection, or undefined before first configuration.
 */
export async function readProductPlatform(userData: string): Promise<ProductPlatform | undefined> {
  let text: string
  try { text = await readFile(join(userData, 'platform.json'), 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  return parseProductPlatform(JSON.parse(text))
}

/**
 * Save public endpoints atomically and select a service-specific account directory.
 * @param userData Stable brand-owned user-data directory.
 * @param platform Validated public endpoints.
 * @returns Absolute native account configuration path; old platforms remain intact.
 */
export async function saveProductPlatform(userData: string, platform: ProductPlatform): Promise<string> {
  // A short service digest keeps account homes and their plugin installs under the Windows MAX_PATH limit.
  const key = createHash('sha256').update(platform.gatewayOrigin).digest('hex').slice(0, 16)
  const storageDirectory = join(userData, 'platforms', key)
  await mkdir(storageDirectory, { recursive: true, mode: 0o700 })
  const identity = join(storageDirectory, 'identity.json')
  await writeFileAtomic(identity, JSON.stringify({ ...platform, storageDirectory, loginTimeoutMs: 180000, checkIntervalMs: 30000 }, null, 2) + '\n', { mode: 0o600 })
  await writeFileAtomic(join(userData, 'platform.json'), JSON.stringify(platform, null, 2) + '\n', { mode: 0o600 })
  return identity
}
