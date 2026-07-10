import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "1 habit" / "3 habits" — the one pluralized count readout. */
export function countLabel(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}
