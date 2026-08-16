import { describe, expect, it } from '@jest/globals';

import { stitchSpoken, tidyDictation } from '@/lib/note-tidy';
import { buildVocabulary } from '@/lib/note-vocabulary';

const V = buildVocabulary();

/** Two segments as the recogniser hands them over: each capitalised, each closed with a full stop,
 *  because each was decoded on its own. */
function say(first: string, second: string, vocabulary = V): string {
  return stitchSpoken(first, second, vocabulary);
}

describe('tidyDictation', () => {
  it('drops a filler and the pause punctuation around it', () => {
    expect(tidyDictation('I went, um, home.')).toBe('I went home.');
    expect(tidyDictation('The day was, uh, long.')).toBe('The day was long.');
  });

  it('keeps the capital when the filler was the first word', () => {
    expect(tidyDictation('Um, the day was good.')).toBe('The day was good.');
    expect(tidyDictation('Hmm, I don’t know.')).toBe('I don’t know.');
  });

  it('reports a segment that was only filler as nothing said', () => {
    expect(tidyDictation('Uh.')).toBe('');
    expect(tidyDictation('Um, uh.')).toBe('');
  });

  it('never touches a filler living inside a real word', () => {
    expect(tidyDictation('I forgot my umbrella.')).toBe('I forgot my umbrella.');
    expect(tidyDictation('The room was humming.')).toBe('The room was humming.');
  });

  it('collapses a stutter on a function word', () => {
    expect(tidyDictation('I I went to to the masjid.')).toBe('I went to the masjid.');
    expect(tidyDictation('I, I was tired.')).toBe('I was tired.');
    expect(tidyDictation('The the day was long.')).toBe('The day was long.');
  });

  // The reason the stutter list is a list and not `\b(\w+)\s+\1\b`.
  it('leaves a doubled word that is real English', () => {
    expect(tidyDictation('I had had enough.')).toBe('I had had enough.');
    expect(tidyDictation('It was very very cold.')).toBe('It was very very cold.');
    expect(tidyDictation('I know that that was said.')).toBe('I know that that was said.');
  });

  // Verbatim from the probe: the model's own test clip, cut at 60%, sent the decoder into a loop.
  // Nothing else in this file could touch it.
  it('collapses a decoder loop, stub and all', () => {
    expect(
      tidyDictation(
        'Ask not what your country can do for you ask not what your country ' +
          'can do for you ask not what your country can',
      ),
    ).toBe('Ask not what your country can do for you');
  });

  it('takes the longest repeated phrase, not the shortest', () => {
    expect(tidyDictation('one two three four one two three four')).toBe('one two three four');
  });

  // The entire safety argument for the loop rule: a person who repeats themselves pauses, and the
  // recogniser writes the pause down.
  it('leaves emphatic repetition that carries its own punctuation', () => {
    expect(tidyDictation('I don’t know what to do, I don’t know what to do.')).toBe(
      'I don’t know what to do, I don’t know what to do.',
    );
  });

  it('leaves a repeat too short to be a loop', () => {
    expect(tidyDictation('It was long long ago.')).toBe('It was long long ago.');
  });

  it('leaves an ordinary sentence exactly as it came', () => {
    const spoken = 'I read a page of Qurʾān after ʿIshāʾ, and it was quiet.';
    expect(tidyDictation(spoken)).toBe(spoken);
  });

  it('does not impose a capital the recogniser did not give', () => {
    expect(tidyDictation('um, and then home.')).toBe('and then home.');
  });
});

describe('stitchSpoken', () => {
  // The defect this module exists for, quoted from voice-gate.ts's own comment.
  it('re-joins a sentence the gate cut in half', () => {
    expect(say('I prayed Fajr.', 'On time.')).toBe('I prayed Fajr on time.');
    expect(say('It was busy.', 'At work.')).toBe('It was busy at work.');
    expect(say('I read a page.', 'Before bed.')).toBe('I read a page before bed.');
  });

  it('joins when the recogniser never closed the sentence', () => {
    expect(say('I prayed', 'Fajr on time.')).toBe('I prayed Fajr on time.');
    expect(say('It was cold and', 'the masjid was empty.')).toBe('It was cold and the masjid was empty.');
  });

  // A trailing comma is the same signal as no punctuation at all.
  it('joins across a segment that ended mid-clause', () => {
    expect(say('When I got home,', 'It was already dark.')).toBe('When I got home, it was already dark.');
  });

  it('protects a capital the app has an opinion about', () => {
    expect(say('I prayed', 'Fajr on time.')).toContain('Fajr');
    expect(say('I finally made', 'Duhā today.')).toBe('I finally made Duhā today.');
  });

  it('protects the pronoun and an acronym', () => {
    expect(say('I went out and', 'I was late.')).toBe('I went out and I was late.');
    expect(say('I was reading', 'I’m not sure what.')).toBe('I was reading I’m not sure what.');
    expect(say('I listened to', 'BBC in the car.')).toBe('I listened to BBC in the car.');
  });

  // The excluded words: people genuinely start sentences with these.
  it('leaves a sentence that merely opens with a conjunction', () => {
    expect(say('I went home.', 'And it was late.')).toBe('I went home. And it was late.');
    expect(say('I was tired.', 'But I prayed.')).toBe('I was tired. But I prayed.');
    expect(say('It rained.', 'So I stayed in.')).toBe('It rained. So I stayed in.');
  });

  it('leaves a short sentence opening with a demonstrative', () => {
    expect(say('I went home.', 'That was hard.')).toBe('I went home. That was hard.');
    expect(say('I forgot ʿAṣr.', 'Which annoyed me.')).toBe('I forgot ʿAṣr. Which annoyed me.');
  });

  // The length guard, without which the continuation list would be actively harmful.
  it('leaves a full clause that happens to open with a preposition', () => {
    expect(say('I woke early.', 'On Friday I went to jumuʿah.')).toBe('I woke early. On Friday I went to jumuʿah.');
    expect(say('It was quiet.', 'In the morning I read a page.')).toBe(
      'It was quiet. In the morning I read a page.',
    );
  });

  it('never joins across a question or an exclamation', () => {
    expect(say('Was it worth it?', 'In the end.')).toBe('Was it worth it? In the end.');
    expect(say('What a day!', 'After all that.')).toBe('What a day! After all that.');
  });

  it('reads past a closing quote to find the punctuation that matters', () => {
    expect(say('He said “enough.”', 'That was that.')).toBe('He said “enough.” That was that.');
  });

  it('adds nothing for nothing, and starts the note when there is nothing there', () => {
    expect(say('Already written.', '   ')).toBe('Already written.');
    expect(say('', 'First words.')).toBe('First words.');
  });

  it('works without a vocabulary', () => {
    expect(stitchSpoken('I prayed Fajr.', 'On time.')).toBe('I prayed Fajr on time.');
  });
});

/**
 * Not invented — decoded.
 *
 * These are the exact strings Moonshine base-en quantised (2026-02-27, the model the app downloads)
 * returned when the tarball's own `test_wavs/0.wav` was cut at a series of points and each half
 * decoded on its own, which is precisely what the energy gate does to real speech. They are here
 * because the stitching rules were written against a *prediction* about how this model punctuates a
 * fragment, and the prediction was half wrong: it does **not** blindly capitalise and close every
 * segment. It decides — and when it decides a fragment is unfinished it says so, which turns out to
 * be the strongest signal available.
 *
 * Still synthetic in one respect: this is a recording of a speech, not of the user at 23:40. Real
 * voices remain the open question.
 */
describe('real decoder output', () => {
  const WHOLE = 'Ask not what your country can do for you. Ask what you can do for your country.';

  // Cut at 40%. The head came back with no terminal punctuation at all and the tail came back
  // lower-case — the model telling us, unprompted, that it had been handed half a sentence.
  it('rebuilds the sentence a mid-clause cut broke', () => {
    expect(say('Ask not what your country can do', 'for you. Ask what you can do for your country.')).toBe(WHOLE);
  });

  // Cut at 50%, which happened to land on the real sentence boundary. Both halves came back whole,
  // and the join must NOT fire — this is the case where two sentences are genuinely two sentences.
  it('leaves a cut that fell on a real boundary alone', () => {
    expect(say('Ask not what your country can do for you.', 'Ask what you can do for your country')).toBe(
      'Ask not what your country can do for you. Ask what you can do for your country',
    );
  });

  // Cut at 75%. The tail was capitalised and closed, so only the head's missing full stop can carry
  // the join — Tier 1 doing the work the continuation word list cannot.
  it('joins on the head’s missing full stop when the tail looks like a sentence', () => {
    expect(say('Ask not what your country can do for you ask what you can', 'You for your country.')).toBe(
      'Ask not what your country can do for you ask what you can you for your country.',
    );
  });

  // The last 0.8s alone. A short capitalised adjunct, closed — exactly the shape the continuation
  // list plus the length guard exist for.
  it('joins the orphaned adjunct the gate left behind', () => {
    expect(say('You can do', 'For your country.')).toBe('You can do for your country.');
  });
});

describe('a sitting, end to end', () => {
  // What actually happens: raw segments in, one readable paragraph out.
  it('turns the gate’s fragments back into sentences', () => {
    const segments = ['Um, I prayed Fajr.', 'On time.', 'Then I I read a page.', 'Of Qurʾān.'];
    let body = '';
    for (const raw of segments) {
      const spoken = tidyDictation(raw);
      if (!spoken) continue;
      body = body ? stitchSpoken(body, spoken, V) : spoken;
    }
    expect(body).toBe('I prayed Fajr on time. Then I read a page of Qurʾān.');
  });

  it('drops a segment that was only a filler without breaking the join', () => {
    const segments = ['I went out.', 'Uh.', 'In the rain.'];
    let body = '';
    for (const raw of segments) {
      const spoken = tidyDictation(raw);
      if (!spoken) continue;
      body = body ? stitchSpoken(body, spoken, V) : spoken;
    }
    expect(body).toBe('I went out in the rain.');
  });
});
