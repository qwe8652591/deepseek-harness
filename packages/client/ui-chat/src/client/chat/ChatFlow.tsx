/** Ordered Chat rows, local echoes, and running status share the flow slot's parent. */
import { memo, useMemo } from 'react'
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { ChatFlowOwnerProps, ChatFlowSlotProps } from '../contract/slots.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { ChatGroupSeat } from './ChatGroupSeat.tsx'
import { PendingSteeringBubble, PendingSubmissionBubble } from './MessageItem.tsx'
import { chatRenderKey } from './render-entry.ts'
import { RunningStatus } from './RunningStatus.tsx'

/** The one message that hosts the opening footer, or neither before it is known. */
interface OpeningMessageTarget {
  readonly leadingUserKey: string | null
  readonly leadingPendingId: string | null
}

const NO_OPENING: OpeningMessageTarget = { leadingUserKey: null, leadingPendingId: null }

/**
 * The opening user message hosts the footer only once older history is fully
 * loaded. A pending transcript echo hosts it until that durable node arrives.
 * @param hasMore - whether older history remains paged out.
 * @param order - durable chat node keys, oldest first.
 * @param kindAt - kind lookup for one node key, as the Node store reports it.
 * @param pendingInputs - visible echoes and steering rows.
 * @returns the single host key, or neither when the opening is not loaded yet.
 */
function openingUserMessageTarget(
  hasMore: boolean,
  order: readonly string[],
  kindAt: (key: string) => string | undefined,
  pendingInputs: ChatFlowOwnerProps['pendingInputs'],
): OpeningMessageTarget {
  if (hasMore) return NO_OPENING
  for (const key of order) {
    if (kindAt(key) === 'user') return { leadingUserKey: key, leadingPendingId: null }
  }
  const pending = pendingInputs.find((item): item is PendingSubmission => (
    'requestId' in item && item.placement !== 'steering'
  ))
  return { leadingUserKey: null, leadingPendingId: pending?.requestId ?? null }
}

/** Render the flow without adding a DOM parent or changing keyed row positions. */
export const ChatFlow = memo(function ChatFlow({
  entries, pendingInputs, lastInputTurn, deferCollapse,
  useSession, useChat, useChatNode, useChatNodeBottom, useChatNodeProcess, useChatGroup, usePresentation,
  useStore, actions, renderSlot, renderFactorySlot, t, useGroupAction, useGroupHeaderAction,
  cwd, openFile, inspectCall, forkAt, loadImage, fileMentions,
}: ChatFlowSlotProps) {
  const nodeStore = useChat(snapshot => snapshot.nodes)
  const running = useSession(snapshot => snapshot.running)
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const order = useChat(snapshot => snapshot.order)
  const latestTurnAnchor = useChat(snapshot => snapshot.navigation.items().at(-1)?.anchorKey)
  const runningStartTime = useChatNode(latestTurnAnchor ?? '', (node) => {
    const location = node?.location
    return location?.kind === 'turn' || location?.kind === 'step'
      ? location.turn.status === 'open' ? location.turn.start?.time : undefined
      : undefined
  })
  const opening = useMemo(
    () => openingUserMessageTarget(hasMore, order, key => nodeStore.get(key)?.kind, pendingInputs),
    [hasMore, order, nodeStore, pendingInputs],
  )
  const hasOpening = opening.leadingUserKey !== null || opening.leadingPendingId !== null
  const messageFooter = useMemo(
    () => hasOpening ? renderSlot('conversation.chat.userMessageFooter', { leading: true }) : null,
    [hasOpening, renderSlot],
  )
  const seatProps = {
    nodeStore, useChatNode, useChatNodeBottom, useChatNodeProcess, usePresentation,
    useStore, actions, renderSlot, t, useGroupAction, deferCollapse,
    cwd, openFile, inspectCall, forkAt, loadImage, fileMentions,
    leadingUserKey: opening.leadingUserKey, messageFooter,
  }
  const rows = entries.map((entry) => {
    switch (entry.kind) {
      case 'node':
        return <ChatNodeSeat {...seatProps} key={chatRenderKey(entry)} nodeKey={entry.key}
          {...entry.groupPart === undefined ? {} : { groupPart: entry.groupPart }} />
      case 'group':
        return <ChatGroupSeat {...seatProps} key={chatRenderKey(entry)} groupKey={entry.key}
          useChatGroup={useChatGroup} useGroupHeaderAction={useGroupHeaderAction} />
      default:
        return assertNever(entry)
    }
  })
  const pendingRows = pendingInputs.map(item => 'requestId' in item ? (
    <PendingSubmissionBubble key={item.requestId} submission={item}
      footer={item.requestId === opening.leadingPendingId ? messageFooter : null}
      loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
  ) : (
    <PendingSteeringBubble key={item.id} content={item.content}
      loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} />
  ))
  const tail = entries.at(-1)
  const node = tail?.kind === 'node' ? nodeStore.get(tail.key) : undefined
  // An empty opening control follows one local transcript echo, never steering.
  // All rows share this keyed list so inserting the control keeps the echo mounted.
  if (node?.kind === 'turn-process' && node.location.kind === 'turn'
    && node.location.turn.status === 'open' && node.location.turn.turn !== lastInputTurn) {
    const index = pendingInputs.findIndex(item => 'requestId' in item && item.placement === 'transcript')
    if (index !== -1) rows.splice(rows.length - 1, 0, ...pendingRows.splice(index, 1))
  }
  return [...rows, ...pendingRows, ...running ? [<RunningStatus key="running" startTime={runningStartTime} t={t} />] : []]
})
