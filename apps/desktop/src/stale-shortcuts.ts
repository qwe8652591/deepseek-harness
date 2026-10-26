import { readdir, rm, stat } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'

/** Shortcut fields this cleanup reads (Electron's `shell.readShortcutLink` result on Windows). */
export interface ShortcutTarget { readonly target: string }

/** Injectable file and shell access, so the rule is testable without a Windows shell. */
export interface StaleShortcutEnvironment {
  readonly readShortcut: (path: string) => ShortcutTarget
  readonly exists: (path: string) => Promise<boolean>
  readonly list: (directory: string) => Promise<string[]>
  readonly remove: (path: string) => Promise<void>
}

const fileExists = async (path: string): Promise<boolean> => stat(path).then(() => true, () => false)

/** Node file access plus a shortcut reader, normally Electron's `shell.readShortcutLink`. */
export const defaultStaleShortcutEnvironment = (readShortcut: (path: string) => ShortcutTarget): StaleShortcutEnvironment => ({
  readShortcut,
  exists: fileExists,
  list: async directory => readdir(directory).catch(() => []),
  remove: async path => rm(path, { force: true }),
})

/** Whether `path` lies inside `directory` (case-insensitive, as Windows paths are). */
function inside(directory: string, path: string): boolean {
  const rest = relative(directory.toLowerCase(), path.toLowerCase())
  return rest !== '' && !rest.startsWith('..') && !isAbsolute(rest)
}

/**
 * Remove shortcuts left behind when the product was renamed: a rename installs `<new name>.exe` and new shortcuts,
 * while the installer never deletes shortcuts that still carry an old name and point at the old executable.
 * Only `.lnk` files directly in the given directories are considered, and one is removed only when its target is inside
 * this installation's directory and no longer exists; shortcuts of other applications are never touched.
 * @param installDirectory - Directory of the running executable.
 * @param shortcutDirectories - Desktop and Start Menu Programs folders of the current user.
 * @param environment - File and shortcut access.
 * @returns Paths of removed shortcuts.
 */
export async function removeStaleShortcuts(
  installDirectory: string, shortcutDirectories: readonly string[], environment: StaleShortcutEnvironment,
): Promise<string[]> {
  const removed: string[] = []
  for (const directory of shortcutDirectories) {
    for (const name of await environment.list(directory)) {
      if (!name.toLowerCase().endsWith('.lnk')) continue
      const path = join(directory, name)
      let target: string
      try { target = environment.readShortcut(path).target } catch { continue }
      if (!target || !inside(installDirectory, target) || await environment.exists(target)) continue
      await environment.remove(path)
      removed.push(path)
    }
  }
  return removed
}
