export function dailyNoteRefresh(
  openedOn: string,
  currentDay: string,
  draft: string,
  saved: string,
): { dayChanged: boolean; shouldLoad: boolean } {
  return {
    dayChanged: currentDay !== openedOn,
    shouldLoad: draft.trim() === saved,
  };
}
