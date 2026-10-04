/** Composer takeover for one pending approval waterfall. */
import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ApprovalComposerProps, PendingApproval } from './contract/slots.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ApprovalPanel.module.css'

/**
 * Render one pending approval and its optional Tool-owned detail.
 * @param props - selector-matched request and standard Slot props.
 * @returns The approval composer takeover.
 */
export function ApprovalPanel(props: ApprovalComposerProps) {
  const approval = props.matched
  const detail = approval.callId === undefined
    ? null
    : props.renderSlot('conversation.approval.detail', { callId: approval.callId })
  return <ApprovalFlow key={approval.key} pending={approval} detail={detail} t={props.t} />
}

function ApprovalFlow({ pending, detail, t, busy = false, canAllow = true }: {
  pending: Pick<PendingApproval, 'key' | 'toolName' | 'reason' | 'answer'>
  detail: ReactNode
  t: ApprovalComposerProps['t']
  busy?: boolean
  canAllow?: boolean
}) {
  const [answered, setAnswered] = useState(false)
  const answer = (outcome: 'allowed-once' | 'rejected'): void => {
    setAnswered(true)
    void pending.answer(outcome).catch(() => { setAnswered(false) })
  }
  return (
    <div className={css.root} data-approval-key={pending.key}>
      <div className={css.card}>
        <div className={css.strip}><span className={css.dot} />{t('waiting')}</div>
        <div
          className={css.body}
          data-approval-scroll=""
          tabIndex={0}
          role="group"
          aria-label={t('detail.aria')}
        >
          <div className={css.headline}>{pending.reason ?? t('escalation', { toolName: pending.toolName })}</div>
          {detail !== null && <div className={css.command}>{detail}</div>}
        </div>
        <div className={css.actionRow}>
          <Button variant="outline" className={css.reject} disabled={answered || busy} onClick={() => { answer('rejected') }}>
            {t('reject')}
          </Button>
          <Button variant="primary" disabled={answered || busy || !canAllow} onClick={() => { answer('allowed-once') }}>
            {t('allowOnce')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Render an external engine request with the native approval flow.
 * @param props - Displayed request and its engine-owned answer callback.
 * @returns The shared approval card.
 */
export function WorkbenchApprovalPanel({ approval, answer, busy, t }: PropsRuntime<'workbench.conversation.approval'> & PropsLocale<'approval'>) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const detail = <>
    <pre>{approval.detail}</pre>
    {approval.questions.map((item, index) => <label key={item.question}>
      {item.question}
      <input aria-label={item.question} list={`${approval.id}-${index}`} value={answers[item.question] ?? ''}
        onChange={(event) => { setAnswers({ ...answers, [item.question]: event.target.value }) }} />
      <datalist id={`${approval.id}-${index}`}>{item.options.map(option => <option key={option} value={option} />)}</datalist>
    </label>)}
  </>
  return <ApprovalFlow key={approval.id} pending={{
    key: approval.id, toolName: approval.tool, reason: undefined,
    answer: outcome => answer(outcome === 'allowed-once', answers),
  }} detail={detail} busy={busy} canAllow={approval.questions.every(item => answers[item.question]?.trim())} t={t} />
}
