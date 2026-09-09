/** Bid Studio browser plugin: application navigation row and keyed workbench page. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BidNavigation } from './BidNavigation.tsx'
import { BidStudio } from './BidStudio.tsx'
import { BID_ONTOLOGY } from '../definition.ts'
import { en, zh } from './locales.ts'

/** Key shared by the navigation command and keyed application slot. */
export const BID_STUDIO_APPLICATION_ID = brandString<MainPanelId>('bid-studio')

/** Services required by the browser half. */
export const inject = ['slots', 'layout', 'locale', 'remote', 'remote.ontologyRemote']

/** Register the menu and page as independently disposable slot contributions. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('bidStudio', { zh, en }), 'bid-studio: dictionaries')
  const t = ctx.locale.bind('bidStudio')
  const remote = {
    async listObjects(type?: Parameters<typeof ctx.remote.ontologyRemote.listObjects>[0]) {
      const result = await ctx.remote.ontologyRemote.listObjects(type)
      if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
      return result.value
    },
    async execute(
      action: Parameters<typeof ctx.remote.ontologyRemote.executeAction>[0],
      input: Parameters<typeof ctx.remote.ontologyRemote.executeAction>[1],
    ) {
      const result = await ctx.remote.ontologyRemote.executeAction(action, input)
      if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
      return result.value
    },
  }
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: BID_STUDIO_APPLICATION_ID,
    order: 100,
    label: () => t('page.title'),
  }, BidNavigation))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: BID_STUDIO_APPLICATION_ID,
    locale: 'bidStudio',
    inject: () => ({
      definition: BID_ONTOLOGY,
      remote,
      close: () => { ctx.layout.selectPanel(null) },
    }),
  }, BidStudio))
}
