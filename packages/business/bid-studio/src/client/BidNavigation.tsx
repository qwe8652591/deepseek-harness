/** Sidebar navigation contribution for Bid Studio. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChecklistOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './BidStudio.module.css'

type Props = PropsRuntime<'sidebar.panellist'>

/** Render the wide or compact bid-workbench navigation button. */
export function BidNavigation({ size }: Props) {
  return <IconChecklistOutline14 size={size} className={css.navIcon} />
}
