/** Shared Chat presentation for engine-projected workbench records. */
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'
import { UserStyleBubble } from './MessageItem.tsx'
import { MessageIconActions } from './MessageIconActions.tsx'

/** Render external engine text using native Chat bubbles and Markdown.
 * @param props - Engine-normalized display record and Chat locale.
 * @returns The shared message presenter.
 */
export function WorkbenchMessage({ message, t }: PropsRuntime<'workbench.conversation.message'> & PropsLocale<'chat'>) {
  if (message.kind === 'user') return <UserStyleBubble content={[{ type: 'text', text: message.text }]}
    renderMessageImages={() => null} t={t} actions={text => <MessageIconActions text={text} clock="start" t={t} />} />
  if (message.kind === 'assistant') return <AssistantMarkdown blocks={[{ kind: 'text', text: message.text }]}
    streaming={message.streaming === true} renderMessageImages={() => null} t={t} />
  if (message.kind === 'tool' || message.kind === 'result') {
    let payload: unknown = message.text
    try { payload = JSON.parse(message.text) }
    catch {
      // Tool outputs may be plain text; only JSON syntax failures can reach here.
    }
    return <JsonBlock label={message.label ?? t('message.extraBlock')}
      payload={payload} truncatedLabel={total => t('json.truncated', { total })} />
  }
  return <div role={message.kind === 'error' ? 'alert' : 'status'}>{message.label} {message.text}</div>
}
