import { describe, expect, it } from '@jest/globals';

import {
  appendSpoken,
  appendToBody,
  groupByMonth,
  hasBody,
  matchesQuery,
  noteDateTitle,
  notePreview,
  noteRowContract,
  spokenLabel,
  type DailyNote,
} from '@/lib/notes';

const TODAY = '2026-08-15'; // a Saturday

function note(overrides: Partial<DailyNote> = {}): DailyNote {
  return {
    id: 'n1',
    user_id: 'u1',
    note_date: TODAY,
    body: 'A quiet day.',
    spoken_seconds: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('appendToBody', () => {
  it('separates one sitting from the next with a blank line', () => {
    expect(appendToBody('This morning was good.', 'Tonight was harder.')).toBe(
      'This morning was good.\n\nTonight was harder.',
    );
  });

  it('starts the note when there is nothing there yet', () => {
    expect(appendToBody('', 'First words.')).toBe('First words.');
  });

  it('adds nothing for nothing', () => {
    expect(appendToBody('Already written.', '   ')).toBe('Already written.');
  });

  // A week of appends must not grow a widening gap at the foot of the entry.
  it('does not accumulate whitespace across appends', () => {
    let body = '';
    for (const line of ['One.', 'Two.', 'Three.']) body = appendToBody(body, line);
    expect(body).toBe('One.\n\nTwo.\n\nThree.');
  });
});

describe('appendSpoken', () => {
  it('joins sentences with a space, not a paragraph', () => {
    expect(appendSpoken('I prayed Fajr on time.', 'It was hard to get up.')).toBe(
      'I prayed Fajr on time. It was hard to get up.',
    );
  });

  // The one kind of tidying this feature is not allowed to do.
  it('does not invent punctuation onto an unfinished thought', () => {
    expect(appendSpoken('I was thinking about', 'how the week went')).toBe(
      'I was thinking about how the week went',
    );
  });
});

describe('hasBody', () => {
  it('treats whitespace as nothing', () => {
    expect(hasBody(note({ body: '  \n ' }))).toBe(false);
    expect(hasBody(note({ body: 'x' }))).toBe(true);
    expect(hasBody(null)).toBe(false);
  });
});

describe('notePreview', () => {
  it('flattens the paragraph breaks so the row stays one line', () => {
    expect(notePreview('First.\n\nSecond.')).toBe('First. Second.');
  });

  it('cuts at a word', () => {
    const preview = notePreview('a'.repeat(20) + ' ' + 'b'.repeat(20) + ' ' + 'c'.repeat(80), 50);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).not.toContain('c');
  });

  it('hard-cuts a single unbroken run rather than returning the whole body', () => {
    expect(notePreview('x'.repeat(200), 20)).toBe('x'.repeat(20) + '…');
  });

  it('leaves a short note whole', () => {
    expect(notePreview('A quiet day.')).toBe('A quiet day.');
  });
});

describe('spokenLabel', () => {
  it('says nothing at all for a note that was typed', () => {
    expect(spokenLabel(null)).toBeNull();
    expect(spokenLabel(0)).toBeNull();
  });

  it('reads as a duration, not a clock', () => {
    expect(spokenLabel(40)).toBe('40 sec');
    expect(spokenLabel(135)).toBe('2 min');
  });
});

describe('noteDateTitle', () => {
  it('names the two days that have names', () => {
    expect(noteDateTitle(TODAY, TODAY)).toBe('Today');
    expect(noteDateTitle('2026-08-14', TODAY)).toBe('Yesterday');
  });

  // A column of thirty rows cannot use bare weekdays — three "Thursday"s name nothing.
  it('carries the date for everything older', () => {
    expect(noteDateTitle('2026-08-11', TODAY)).toContain('Aug');
  });

  it('carries the year once it is not this one', () => {
    expect(noteDateTitle('2025-08-11', TODAY)).toContain('2025');
    expect(noteDateTitle('2026-08-11', TODAY)).not.toContain('2026');
  });
});

describe('groupByMonth', () => {
  it('groups newest first, within and across months', () => {
    const months = groupByMonth(
      [
        note({ id: 'a', note_date: '2026-07-02' }),
        note({ id: 'b', note_date: '2026-08-15' }),
        note({ id: 'c', note_date: '2026-08-01' }),
      ],
      TODAY,
    );
    expect(months.map((m) => m.key)).toEqual(['2026-08', '2026-07']);
    expect(months[0]!.notes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(months[0]!.label).toBe('August');
  });

  it('names the year on a month outside this one', () => {
    expect(groupByMonth([note({ note_date: '2025-03-04' })], TODAY)[0]!.label).toBe('March 2025');
  });

  it('is empty for an empty archive', () => {
    expect(groupByMonth([], TODAY)).toEqual([]);
  });
});

describe('matchesQuery', () => {
  const spoken = note({ body: 'Made duʿāʾ after ʿIshāʾ. Alḥamdulillāh.', note_date: '2026-03-04' });

  // The reason search folds at all: nobody types ḥ.
  it('finds the app’s orthography from a plain-keyboard search', () => {
    expect(matchesQuery(spoken, 'dua', TODAY)).toBe(true);
    expect(matchesQuery(spoken, 'alhamdulillah', TODAY)).toBe(true);
    expect(matchesQuery(spoken, 'isha', TODAY)).toBe(true);
  });

  it('searches the date as it is shown, and as it is stored', () => {
    expect(matchesQuery(spoken, 'Mar', TODAY)).toBe(true);
    expect(matchesQuery(spoken, '2026-03', TODAY)).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery(spoken, '   ', TODAY)).toBe(true);
  });

  it('does not match what is not there', () => {
    expect(matchesQuery(spoken, 'landlord', TODAY)).toBe(false);
  });
});

describe('noteRowContract', () => {
  it('asks a question on today, and only on today', () => {
    expect(noteRowContract({ body: '', isToday: true, dayTitle: 'Today' }).text).toBe('How was today?');
    expect(noteRowContract({ body: '', isToday: false, dayTitle: 'Tuesday' }).text).toBe(
      'Add a note for tuesday',
    );
  });

  it('shows the entry once there is one', () => {
    const row = noteRowContract({ body: '  A quiet day.  ', isToday: true, dayTitle: 'Today' });
    expect(row.mode).toBe('read');
    expect(row.text).toBe('A quiet day.');
  });

  it('treats a whitespace-only body as nothing written', () => {
    expect(noteRowContract({ body: '\n  \n', isToday: true, dayTitle: 'Today' }).mode).toBe('write');
  });
});
