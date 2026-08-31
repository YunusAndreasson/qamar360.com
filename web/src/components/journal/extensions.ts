import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownKeymap } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
  type Extension,
  type Range,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'

import { MAX_NOTE_LENGTH, clampBody } from '#/lib/notes'

/**
 * The writing surface, in the manner of iA Writer: a plain-text document with structure
 * *styled* rather than replaced. Markdown is parsed only to decorate — the `#` and `*`
 * characters stay on screen, dimmed, and what is saved is exactly what was typed. That
 * matters beyond taste: the phone renders `daily_notes.body` as raw text and the insights
 * prompt reads it verbatim, so this surface may never introduce markup of its own.
 *
 * Every colour here resolves a global custom property from `styles.css`, so the editor
 * cannot drift from the console palette.
 */

/** Placeholder copy is the phone's, word for word, so the two surfaces read as one feature. */
const PLACEHOLDER = 'What was easy, difficult, or present in your heart today?'

const writingTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
    fontFamily: 'var(--font-sans)',
    fontSize: '1.1875rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.75',
    overflow: 'auto',
  },
  '.cm-content': { padding: '0', caretColor: 'var(--primary)' },
  // Typewriter mode's air, defined here rather than in its own theme. A theme mounted later
  // is inserted *earlier* in <head> by style-mod, so a separate module would lose the padding
  // tie to this one. One stylesheet, one winner: the class below is what the compartment adds.
  '&.cm-typewriter .cm-content': { padding: '38vh 0 45vh' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
  '.cm-placeholder': { color: 'color-mix(in oklab, var(--muted-foreground) 60%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 26%, transparent)',
  },
  // Focus mode: everything outside the paragraph under the caret recedes.
  '.cm-dimmed': { opacity: '0.32', transition: 'opacity 180ms ease' },
  '@media (prefers-reduced-motion: reduce)': {
    '.cm-dimmed': { transition: 'none' },
  },
})

/**
 * Markdown, coloured as prose rather than as code. The `processingInstruction` rule is last
 * on purpose: it covers every syntax mark (`HeaderMark`, `EmphasisMark`, `ListMark`, …) and
 * has to win the colour while still inheriting its heading's size — a dim `#` at heading
 * scale is the whole iA Writer trick.
 */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--foreground)', fontWeight: '600', fontSize: '1.35em' },
  { tag: tags.heading2, color: 'var(--foreground)', fontWeight: '600', fontSize: '1.2em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: 'var(--foreground)', fontWeight: '600', fontSize: '1.1em' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--primary)' },
  { tag: tags.url, color: 'color-mix(in oklab, var(--muted-foreground) 60%, transparent)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: 'var(--muted-foreground)' },
  { tag: tags.contentSeparator, color: 'color-mix(in oklab, var(--muted-foreground) 60%, transparent)' },
  { tag: tags.processingInstruction, color: 'color-mix(in oklab, var(--muted-foreground) 60%, transparent)', fontWeight: '400' },
])

/**
 * Never let the document exceed what the database will store. An over-long change is
 * trimmed rather than dropped, so a large paste lands as much of itself as fits instead of
 * silently doing nothing — and only the *inserted* text is cut, never text already written.
 *
 * `changeFilter` cannot do this: it can only veto a transaction or protect ranges of the old
 * document. Rewriting one is `transactionFilter`'s job alone.
 */
const lengthCap = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.newDoc.length <= MAX_NOTE_LENGTH) return tr

  const edits: { from: number; to: number; insert: string }[] = []
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    edits.push({ from: fromA, to: toA, insert: inserted.toString() })
  })

  // Spend the overflow on the *last* insertion first: with several carets, the text the
  // writer just typed should survive and the tail of the paste should be what gives way.
  let overflow = tr.newDoc.length - MAX_NOTE_LENGTH
  for (let i = edits.length - 1; i >= 0 && overflow > 0; i -= 1) {
    const edit = edits[i]
    if (!edit) continue
    const keep = Math.max(0, edit.insert.length - overflow)
    overflow -= edit.insert.length - keep
    edit.insert = clampBody(edit.insert, keep) // clamps without splitting a surrogate pair
  }
  if (overflow > 0) return [] // only insertions can overflow; refuse anything we can't make fit

  // The caret has to be placed by hand. Left to CodeMirror, the start-state selection maps to
  // the *start* of a replacement, dropping the caret in front of the text just pasted.
  let shift = 0
  let head = tr.startState.selection.main.head
  for (const edit of edits) {
    head = edit.from + shift + edit.insert.length
    shift += edit.insert.length - (edit.to - edit.from)
  }

  return {
    changes: edits,
    selection: EditorSelection.cursor(head),
    scrollIntoView: tr.scrollIntoView,
    // Carried through so history still groups these edits and so the view's composition
    // handling keeps working when an IME lands exactly on the limit.
    annotations: Transaction.userEvent.of(tr.annotation(Transaction.userEvent) ?? 'input'),
  }
})

const dimmedLine = Decoration.line({ class: 'cm-dimmed' })

/**
 * The line numbers of the paragraph the caret is in — a run of non-blank lines. When the
 * caret rests on a blank line, the paragraph just above stays lit: that is what was being
 * written a moment ago, and blacking out the whole page between thoughts reads as a fault.
 * Returns null when there is nothing written above the caret at all.
 */
export function activeParagraph(state: EditorState, pos: number): { first: number; last: number } | null {
  const { doc } = state
  const blank = (line: number) => doc.line(line).text.trim() === ''
  let anchor = doc.lineAt(pos).number
  while (anchor > 1 && blank(anchor)) anchor -= 1
  if (blank(anchor)) return null
  let first = anchor
  let last = anchor
  while (first > 1 && !blank(first - 1)) first -= 1
  while (last < doc.lines && !blank(last + 1)) last += 1
  return { first, last }
}

function dimOutsideParagraph(view: EditorView): DecorationSet {
  const { state } = view
  const active = activeParagraph(state, state.selection.main.head)
  if (!active) return Decoration.none
  const marks: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    let line = state.doc.lineAt(from)
    for (;;) {
      if (line.number < active.first || line.number > active.last) marks.push(dimmedLine.range(line.from))
      if (line.to >= to || line.number === state.doc.lines) break
      line = state.doc.line(line.number + 1)
    }
  }
  return Decoration.set(marks, true)
}

const focusMode = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = dimOutsideParagraph(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = dimOutsideParagraph(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/**
 * Typewriter scrolling, without a single dispatch of our own: `scrollMargins` tells
 * CodeMirror to keep the caret at least ~42% of the viewport from either edge whenever it
 * scrolls to it, which holds the writing line near the middle of the sheet.
 */
const typewriterMode: Extension = [
  // Air above and below the text, so the first and last lines can both reach the band.
  EditorView.editorAttributes.of({ class: 'cm-typewriter' }),
  EditorView.scrollMargins.of((view) => {
    const margin = Math.round(view.scrollDOM.clientHeight * 0.42)
    return margin > 0 ? { top: margin, bottom: margin } : null
  }),
]

export const focusCompartment = new Compartment()
export const typewriterCompartment = new Compartment()

/** Turn a toggle on or off without tearing the editor down. */
export const focusExtension = (on: boolean): Extension => (on ? focusMode : [])
export const typewriterExtension = (on: boolean): Extension => (on ? typewriterMode : [])

/**
 * Everything the writing surface is. Deliberately absent: gutters, line numbers, an
 * active-line highlight, bracket matching, autocompletion and the search panel — the
 * furniture `basicSetup` would have switched on, none of which belongs on a diary.
 */
export function writingExtensions(options: {
  focus: boolean
  typewriter: boolean
  onChange: (body: string) => void
  onBlur: () => void
  onSave: () => void
}): Extension[] {
  return [
    history(),
    keymap.of([
      // Writers reach for ⌘S out of habit; honour it and keep the browser's own dialog away.
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          options.onSave()
          return true
        },
      },
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    // Parsing only. Every one of these defaults writes markup the diarist did not type:
    // `pasteURLAsLink` rewrites a paste over a selection into `[text](url)`, `completeHTMLTags`
    // offers tag completions, and `addKeymap` installs its bindings at high precedence — which
    // would also make the `markdownKeymap` spread above dead. Enter still continues a list,
    // because that spread now reaches the key first.
    markdown({ addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false }),
    syntaxHighlighting(markdownHighlight),
    EditorView.lineWrapping,
    placeholder(PLACEHOLDER),
    writingTheme,
    lengthCap,
    focusCompartment.of(focusExtension(options.focus)),
    typewriterCompartment.of(typewriterExtension(options.typewriter)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString())
    }),
    EditorView.domEventHandlers({ blur: () => void options.onBlur() }),
  ]
}
