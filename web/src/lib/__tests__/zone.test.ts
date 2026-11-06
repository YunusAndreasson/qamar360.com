import { describe, expect, it } from 'vitest'

import { placeOf } from '../zone'

describe('placeOf', () => {
  it('reads the city from the zone', () => {
    expect(placeOf('Europe/Stockholm')).toBe('Stockholm')
    expect(placeOf('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
    expect(placeOf('Asia/Kuala_Lumpur')).toBe('Kuala Lumpur')
  })

  it('gives a renamed city its name of today, under the old zone name Chrome reports', () => {
    // Chrome reports Kolkata, Kyiv and Ho Chi Minh City under these names.
    expect(placeOf('Asia/Calcutta')).toBe('Kolkata')
    expect(placeOf('Europe/Kiev')).toBe('Kyiv')
    expect(placeOf('Asia/Saigon')).toBe('Ho Chi Minh City')
    // Firefox reports the current ones, which read the same.
    expect(placeOf('Asia/Kolkata')).toBe('Kolkata')
    expect(placeOf('Europe/Kyiv')).toBe('Kyiv')
    expect(placeOf('Asia/Ho_Chi_Minh')).toBe('Ho Chi Minh City')
  })

  it('names a town where the zone is named for a country', () => {
    expect(placeOf('Indian/Maldives')).toBe('Malé')
    expect(placeOf('Indian/Comoro')).toBe('Moroni')
  })
})
