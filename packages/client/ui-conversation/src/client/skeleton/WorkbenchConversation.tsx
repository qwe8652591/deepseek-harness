/** Host-owned conversation presentation for an external agent engine. */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchConversationProps } from '../contract/workbench.ts'
import { ComposerCard, ComposerPrimary } from './ComposerSurface.tsx'
import inputCss from './InputBar.module.css'
import css from './WorkbenchConversation.module.css'

/** Shared editor DOM, undo history, card, and send/stop action.
 * @param props - Engine-independent draft and submission callbacks.
 * @returns The resident composer.
 */
function WorkbenchComposer(props: WorkbenchConversationProps) {
  const [notice, setNotice] = useState<string | null>(null)
  const placeholder = props.t('workbench.prompt')
  return <div className={inputCss.root}>
    {notice !== null && <div role="status" className={inputCss.notice}>{notice}</div>}
    <ComposerCard>
      <div className={inputCss.scroll} data-input-scroll>
        <div className={inputCss.grow}>
          {props.renderSlot('workbench.conversation.editor', {
            draft: props.draft, busy: props.busy, running: props.running, cwd: props.cwd,
            setDraft: props.setDraft, send: props.send, className: inputCss.input,
            onFilesUnsupported: () => { setNotice(props.t('workbench.textOnly')) },
          })}
          {!props.draft && <div aria-hidden className={inputCss.placeholder}>{placeholder}</div>}
        </div>
      </div>
      <div className={inputCss.row}>
        <span className={css.engine}>{props.engine}</span>
        <ComposerPrimary label={props.t(props.running ? 'input.stop' : 'input.send')}
          stopping={props.running} disabled={props.busy || (!props.running && (!props.draft.trim() || !props.cwd.trim()))}
          onMouseDown={(event) => { event.preventDefault() }} onClick={() => { void (props.running ? props.stop() : props.send()) }} />
      </div>
    </ComposerCard>
  </div>
}

/** Render engine projections through the same host message and approval presenters.
 * @param props - Workbench data and engine callbacks.
 * @returns The host-owned conversation page.
 */
export function WorkbenchConversation(props: WorkbenchConversationProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useEffect(() => {
    pinned.current = true
  }, [props.identity])
  useEffect(() => {
    if (pinned.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [props.messages, props.approvals, props.identity])
  const empty = props.messages.length === 0
  return <section className={css.root} data-workbench-conversation>
    <header className={css.header}><strong>{props.title}</strong><span>{props.engine} · {props.status}</span>
      {props.approvals.length > 0 && <button type="button" disabled={props.busy} onClick={() => { void props.stop() }}>{props.t('input.stop')}</button>}
    </header>
    <div className={css.scroll} ref={viewport} onScroll={() => {
      const el = viewport.current
      if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }}>
      <div className={css.transcript}>
        {empty && <div className={css.hero}><h1>{props.t('workbench.welcome')}</h1></div>}
        {props.messages.map(message => <div key={message.id}>
          {props.renderSlot('workbench.conversation.message', { message })}
        </div>)}
        {props.error && <p role="alert" className={css.error}>{props.error}</p>}
      </div>
    </div>
    <div className={css.composer}>
      {!props.started && <div className={css.project}>
        <label>{props.t('workbench.directory')}<input value={props.cwd} disabled={props.busy}
          onChange={(event) => { props.setCwd(event.target.value) }} placeholder={props.t('workbench.directoryHint')} /></label>
        {props.projects.length > 0 && <select aria-label={props.t('workbench.chooseProject')} value="" disabled={props.busy}
          onChange={(event) => { props.setCwd(event.target.value) }}>
          <option value="">{props.t('workbench.chooseProject')}</option>
          {props.projects.map(project => <option key={project.path} value={project.path}>{project.title || project.path}</option>)}
        </select>}
      </div>}
      {props.started && <div className={css.path}>{props.cwd}</div>}
      {props.approvals.length > 0
        ? props.approvals.map(approval => <div key={approval.id} className={css.approval}>
          {props.renderSlot('workbench.conversation.approval', {
            approval, busy: props.busy, answer: (allow, answers) => props.answer(approval.id, allow, answers),
          })}
        </div>)
        : <WorkbenchComposer key={props.identity} {...props} />}
    </div>
  </section>
}
