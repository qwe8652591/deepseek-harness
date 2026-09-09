/** Keyless assembled Bid Studio navigation, human review, and artifact export. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode,
} from './scaffold.ts'
import { newEnglishPage } from './support.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/bid-studio/', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/bid-studio/workbench.expected.md', import.meta.url))
const MODE = webSnapshotMode()

it('opens an installed business panel and exports only after human review', async () => {
  const scaffold = await launchWebScaffold({
    extraOverlayPath: join(BUNDLE, 'cordis.patch.yml'),
    extraInstallAnchors: [join(BUNDLE, 'package.json')],
  })
  try {
    const browser = await chromium.launch()
    try {
      const page = await newEnglishPage(browser)
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      await page.getByRole('button', { name: 'Bid Studio', exact: true }).click()
      await page.getByRole('heading', { name: 'Bid Studio', exact: true }).waitFor()
      const snapshot = await captureStableAria(page, 'main', scaffold.workspaceCwd)
      await compareOrRefreshGolden(EXPECTED, snapshot, MODE)

      await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Bid integration')
      await page.getByRole('button', { name: 'Create', exact: true }).click()
      await page.getByRole('button', { name: 'Run to human review', exact: true }).click()
      const approve = page.getByRole('button', { name: 'Approve review', exact: true })
      await expect.poll(() => approve.isEnabled()).toBe(true)
      const exportBid = page.getByRole('button', { name: 'Export formal bid', exact: true })
      expect(await exportBid.isEnabled()).toBe(false)
      await approve.click()
      await exportBid.click()

      const downloadPending = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download', exact: true }).click()
      const download = await downloadPending
      const artifactPath = join(scaffold.workspaceCwd, 'bid.md')
      await download.saveAs(artifactPath)
      const artifact = await readFile(artifactPath, 'utf8')
      expect(artifact).toContain('Bid integration')
      expect(artifact).toContain('已批准章节：6 项')

      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: 'Open sidebar', exact: true }).waitFor()
      await expect.poll(() => page.locator('main').evaluate(element => element.clientWidth)).toBeGreaterThanOrEqual(320)
      await expect.poll(() => page.locator('main').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      await page.getByRole('button', { name: 'Back to conversation', exact: true }).click()
      await page.getByRole('heading', { name: 'Bid Studio', exact: true }).waitFor({ state: 'detached' })
      expect(tripwire.pageErrors).toEqual([])
      expect(tripwire.warnings).toEqual([])
    } finally {
      await browser.close()
    }
  } finally {
    await scaffold.close()
  }
})
