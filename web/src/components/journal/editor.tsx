import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'

import {
  focusCompartment,
  focusExtension,
  typewriterCompartment,
  typewriterExtension,
  writingExtensions,
} from '#/components/journal/extensions'

export type JournalEditorProps = {
  /** Seeds the document once. Remount (via `key`) to load a different day. */
  initialBody: string
  focus: boolean
  typewriter: boolean
  onChange: (body: string) => void
  onBlur: () => void
  onSave: () => void
}

/**
 * The CodeMirror host. Client-only — `EditorView` reaches for `document` as it is built —
 * and mounted through a dynamic import so none of CodeMirror enters the Worker bundle.
 *
 * The view is created once and lives until the day changes. Callbacks reach it through a
 * ref, and the two toggles go through compartments, so no re-render can tear the editor
 * (and the caret with it) down mid-sentence.
 */
export default function JournalEditor({
  initialBody,
  focus,
  typewriter,
  onChange,
  onBlur,
  onSave,
}: JournalEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const handlers = useRef({ onChange, onBlur, onSave })

  useEffect(() => {
    handlers.current = { onChange, onBlur, onSave }
  })

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const instance = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialBody,
        extensions: writingExtensions({
          focus,
          typewriter,
          onChange: (body) => handlers.current.onChange(body),
          onBlur: () => handlers.current.onBlur(),
          onSave: () => handlers.current.onSave(),
        }),
      }),
    })
    view.current = instance
    instance.focus()
    return () => {
      instance.destroy()
      view.current = null
    }
    // Deliberately built once: `initialBody` seeds the document and the two toggles are
    // reconfigured below, so none of them belong in this dependency list.
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: focusCompartment.reconfigure(focusExtension(focus)) })
  }, [focus])

  useEffect(() => {
    view.current?.dispatch({ effects: typewriterCompartment.reconfigure(typewriterExtension(typewriter)) })
  }, [typewriter])

  return <div ref={host} className="h-full" />
}
