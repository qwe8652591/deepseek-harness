import { expect, it } from 'vitest'
import { removeStaleShortcuts, type StaleShortcutEnvironment } from '../src/stale-shortcuts.ts'

const install = 'C:\\Users\\a\\AppData\\Local\\Programs\\workbench-dsh-desktop'
const desktop = 'C:\\Users\\a\\Desktop'
const menu = 'C:\\Users\\a\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'

/** A fake shell: shortcut file → target, and the executables that exist. */
function environment(shortcuts: Record<string, string>, existing: string[]): StaleShortcutEnvironment & { removed: string[] } {
  const removed: string[] = []
  return {
    removed,
    readShortcut: (path) => {
      const target = shortcuts[path]
      if (target === undefined) throw new Error('not a shortcut')
      return { target }
    },
    exists: async path => existing.some(file => file.toLowerCase() === path.toLowerCase()),
    list: async directory => Object.keys(shortcuts).filter(path => path.startsWith(directory + '\\')).map(path => path.slice(directory.length + 1)),
    remove: async (path) => { removed.push(path) },
  }
}

it('removes shortcuts with an old product name whose executable in this installation is gone', async () => {
  const env = environment({
    [`${desktop}\\工作台.lnk`]: `${install}\\工作台.exe`,
    [`${desktop}\\小云.lnk`]: `${install}\\小云.exe`,
    [`${desktop}\\小云办公.lnk`]: `${install}\\小云办公.exe`,
    [`${menu}\\小云.lnk`]: `${install.toUpperCase()}\\小云.exe`,
  }, [`${install}\\小云办公.exe`])
  const removed = await removeStaleShortcuts(install, [desktop, menu], env)
  expect(removed.sort()).toEqual([`${desktop}\\小云.lnk`, `${desktop}\\工作台.lnk`, `${menu}\\小云.lnk`].sort())
  expect(env.removed).not.toContain(`${desktop}\\小云办公.lnk`)
})

it('never touches shortcuts of other applications, broken ones included, or files that are not shortcuts', async () => {
  const env = environment({
    [`${desktop}\\Other.lnk`]: 'C:\\Program Files\\Other\\Other.exe',
    [`${desktop}\\Sibling.lnk`]: `${install}-old\\Sibling.exe`,
    [`${desktop}\\Folder.lnk`]: install,
  }, [])
  expect(await removeStaleShortcuts(install, [desktop], { ...env, list: async () => ['Other.lnk', 'Sibling.lnk', 'Folder.lnk', 'notes.txt', 'Unreadable.lnk'] })).toEqual([])
  expect(env.removed).toEqual([])
})
