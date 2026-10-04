/** Shared Lexical editing behavior for an external engine's retained draft. */
import { useEffect, useMemo, useRef } from 'react'
import { $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isRangeSelection, createEditor } from 'lexical'
import { registerPlainText } from '@lexical/plain-text'
import { createEmptyHistoryState, registerHistory } from '@lexical/history'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../contract/workbench.ts'
import { ComposerContentEditable } from './editor/ComposerContentEditable.tsx'
import { registerComposerKeymap } from './editor/keymap.ts'

/** Edit an engine draft using the native composer keyboard rules.
 * @param props - Draft, submission state, and localized editor presentation.
 * @returns The shared editable element.
 */
export function WorkbenchEditor(props: PropsRuntime<'workbench.conversation.editor'> & PropsLocale<'conversation'>) {
  const current = useRef(props)
  current.current = props
  const editor = useMemo(() => createEditor({ namespace: 'workbench-composer', onError: (error) => { throw error } }), [])
  useEffect(() => {
    const plain = registerPlainText(editor)
    const history = registerHistory(editor, createEmptyHistoryState(), 1000)
    const keymap = registerComposerKeymap(editor, {
      arbitrate: () => 'pass', space: () => false, dismissPopup: () => {},
      canSubmit: () => !current.current.running && !current.current.busy
        && Boolean(current.current.draft.trim() && current.current.cwd.trim()),
      submit: () => { void current.current.send() },
      intakeFiles: () => { current.current.onFilesUnsupported() },
      pasteText: (text) => {
        if (current.current.busy) return
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) selection.insertRawText(text)
          else $getRoot().selectEnd().insertRawText(text)
        })
      },
    })
    const changed = editor.registerUpdateListener(({ editorState }) => {
      const text = editorState.read(() => $getRoot().getTextContent())
      if (text !== current.current.draft) current.current.setDraft(text)
    })
    return () => { changed(); keymap(); history(); plain() }
  }, [editor])
  useEffect(() => {
    if (editor.getEditorState().read(() => $getRoot().getTextContent()) === props.draft) return
    editor.update(() => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode(props.draft)))
    }, { discrete: true })
  }, [editor, props.draft])
  const placeholder = props.t('workbench.prompt')
  return <ComposerContentEditable editor={editor} editable={!props.busy} className={props.className}
    aria-label={placeholder} data-placeholder={placeholder} />
}
