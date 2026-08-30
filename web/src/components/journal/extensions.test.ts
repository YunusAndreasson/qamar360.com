import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import { activeParagraph, writingExtensions } from './extensions'
import { MAX_NOTE_LENGTH } from '#/lib/notes'

// These exercise the editor at the `EditorState` level, with no `EditorView` anywhere: jsdom
// has no ResizeObserver and its `Range.getClientRects()` returns nothing, so CodeMirror's
// measurement loop cannot run under it. Everything asserted below is pure document logic.

const noop = () => undefined

const stateWith = (doc: string) =>
  EditorState.create({
    doc,
    extensions: writingExtensions({
      focus: true,
      typewriter: false,
      onChange: noop,
      onBlur: noop,
      onSave: noop,
    }),
  })

describe('the length cap', () => {
  it('lets an ordinary edit through untouched', () => {
    const state = stateWith('Fajr was easy')
    const next = state.update({ changes: { from: 13, insert: ' today' } })
    expect(next.state.doc.toString()).toBe('Fajr was easy today')
  })

  it('clamps an over-long paste to exactly what the database will hold', () => {
    const state = stateWith('')
    const next = state.update({ changes: { from: 0, insert: 'P'.repeat(MAX_NOTE_LENGTH + 500) } })
    expect(next.state.doc.length).toBe(MAX_NOTE_LENGTH)
  })

  it('leaves the caret after the text that landed, not in front of it', () => {
    const state = stateWith('hello world')
    const next = state.update({
      changes: { from: 6, to: 11, insert: 'P'.repeat(MAX_NOTE_LENGTH) },
      selection: { anchor: 6 },
    })
    expect(next.state.doc.length).toBe(MAX_NOTE_LENGTH)
    expect(next.state.selection.main.head).toBe(MAX_NOTE_LENGTH)
  })

  it('cuts the incoming paste, never the reflection already written', () => {
    const written = 'a'.repeat(MAX_NOTE_LENGTH - 10)
    const state = stateWith(written)
    const next = state.update({ changes: { from: 0, insert: 'P'.repeat(100) } })
    expect(next.state.doc.length).toBe(MAX_NOTE_LENGTH)
    // Every original character survives; only the pasted run gave way.
    expect(next.state.doc.toString().endsWith(written)).toBe(true)
    expect(next.state.doc.toString().startsWith('P'.repeat(10))).toBe(true)
  })

  it('typing at the limit simply does nothing', () => {
    const state = stateWith('a'.repeat(MAX_NOTE_LENGTH))
    const next = state.update({ changes: { from: MAX_NOTE_LENGTH, insert: 'b' } })
    expect(next.docChanged).toBe(false)
    expect(next.state.doc.length).toBe(MAX_NOTE_LENGTH)
  })

  it('deleting still works once the limit has been reached', () => {
    const state = stateWith('a'.repeat(MAX_NOTE_LENGTH))
    const next = state.update({ changes: { from: 0, to: 5 } })
    expect(next.state.doc.length).toBe(MAX_NOTE_LENGTH - 5)
  })
})

describe('the paragraph focus mode lights', () => {
  const lines = (state: EditorState, at: number) => {
    const found = activeParagraph(state, state.doc.line(at).from)
    return found ? [found.first, found.last] : null
  }

  it('is the whole run of lines around the caret', () => {
    const state = stateWith('one\ntwo\n\nthree\nfour')
    expect(lines(state, 1)).toEqual([1, 2])
    expect(lines(state, 5)).toEqual([4, 5])
  })

  it('is a single line when that line stands alone', () => {
    const state = stateWith('alone\n\nother')
    expect(lines(state, 1)).toEqual([1, 1])
  })

  it('holds on the paragraph above when the caret rests on a blank line', () => {
    // Between thoughts, what was just written should stay lit rather than the page going dark.
    const state = stateWith('one\ntwo\n\n')
    expect(lines(state, 3)).toEqual([1, 2])
  })

  it('lights nothing when there is nothing written above the caret', () => {
    expect(lines(stateWith(''), 1)).toBeNull()
    expect(lines(stateWith('\n\nlater'), 1)).toBeNull()
  })
})
