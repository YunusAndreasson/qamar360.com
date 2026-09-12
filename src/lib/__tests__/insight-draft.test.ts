import { describe, expect, it } from '@jest/globals';

import { draftParagraphs } from '@/lib/local-insight-context';

const reply = [
  '```json',
  '{',
  '  "paragraphs": [',
  '    "Fajr was logged on six of seven days.",',
  '    "It held on the \\"hard\\" days too.\\nA new line.",',
  '    "Keep the alarm where it is."',
  '  ],',
  '  "next_step": "Set it tonight.",',
  '  "evidence_preset_id": null',
  '}',
  '```',
].join('\n');

describe('draftParagraphs', () => {
  it('reads every paragraph of a finished reply and decodes its escapes', () => {
    expect(draftParagraphs(reply)).toEqual([
      'Fajr was logged on six of seven days.',
      'It held on the "hard" days too.\nA new line.',
      'Keep the alarm where it is.',
    ]);
  });

  it('only ever shows the start of what the finished paragraphs will say, at every cut of the reply', () => {
    const finished = draftParagraphs(reply);
    for (let end = 0; end <= reply.length; end += 1) {
      const draft = draftParagraphs(reply.slice(0, end));
      expect(draft.length).toBeLessThanOrEqual(finished.length);
      draft.forEach((paragraph, index) => expect(finished[index]!.startsWith(paragraph)).toBe(true));
    }
  });

  it('shows nothing until a paragraph has begun', () => {
    expect(draftParagraphs('')).toEqual([]);
    expect(draftParagraphs('```json\n{"paragra')).toEqual([]);
    expect(draftParagraphs('{"paragraphs": [')).toEqual([]);
    expect(draftParagraphs('{"paragraphs": ["')).toEqual([]);
  });

  it('decodes unicode escapes and holds back one that is still arriving', () => {
    expect(draftParagraphs('{"paragraphs": ["Qur\\u02bean"]}')).toEqual(['Qurʾan']);
    expect(draftParagraphs('{"paragraphs": ["Qur\\u02')).toEqual(['Qur']);
    expect(draftParagraphs('{"paragraphs": ["Qur\\')).toEqual(['Qur']);
  });
});
