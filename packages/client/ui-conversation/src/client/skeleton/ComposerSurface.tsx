/** Shared composer card and primary action for native and external engines. */
import type { HTMLAttributes, MouseEventHandler, ReactNode, Ref } from 'react'
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './InputBar.module.css'

/** The composer card retains one layout across engines and permission modes.
 * @param props - Card contents and workspace-picker interaction.
 * @returns The shared card element.
 */
export function ComposerCard({ cardRef, workspaceTrigger = false, children, ...props }: HTMLAttributes<HTMLDivElement> & {
  cardRef?: Ref<HTMLDivElement> | undefined
  workspaceTrigger?: boolean
  children: ReactNode
}) {
  return <div {...props} ref={cardRef} className={clsx(css.card, workspaceTrigger && css.cardWorkspaceTrigger)} data-composer-card>
    {children}
  </div>
}

/** The same send/stop action and accessible tooltip for every engine.
 * @param props - Localized label, availability, and action callback.
 * @returns The shared primary button.
 */
export function ComposerPrimary({ label, disabled, stopping, onMouseDown, onClick }: {
  label: string
  disabled: boolean
  stopping: boolean
  onMouseDown?: MouseEventHandler<HTMLButtonElement> | undefined
  onClick: () => void
}) {
  return <Tooltip label={label} side="top" delayMs={500} disabled={disabled}>
    <button type="button" className={css.primary} aria-label={label} disabled={disabled} onMouseDown={onMouseDown} onClick={onClick}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        {stopping
          ? <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
          : <path d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z" fill="currentColor" />}
      </svg>
    </button>
  </Tooltip>
}
