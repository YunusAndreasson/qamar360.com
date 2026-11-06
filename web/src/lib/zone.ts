/**
 * The place a time zone is named for, as the visitor would write it, for "Today in …". Most zones
 * end in their city ("Europe/Stockholm"), but Chrome and Safari report a zone by the name the CLDR
 * keeps for it, which for a few renamed cities is the old one ("Asia/Calcutta", "Europe/Kiev"), and a
 * few zones are named for a country or for islands rather than a town. Those are given here.
 */
const PLACES: Record<string, string> = {
  // Renamed cities, by the zone names browsers still report for them.
  'Asia/Calcutta': 'Kolkata',
  'Europe/Kiev': 'Kyiv',
  'Europe/Uzhgorod': 'Uzhhorod',
  'Europe/Zaporozhye': 'Zaporizhzhia',
  'Asia/Saigon': 'Ho Chi Minh City',
  'Asia/Ho_Chi_Minh': 'Ho Chi Minh City',
  'Asia/Katmandu': 'Kathmandu',
  'Asia/Rangoon': 'Yangon',
  'America/Godthab': 'Nuuk',
  'Africa/Asmera': 'Asmara',
  'Pacific/Enderbury': 'Kanton',
  'Pacific/Truk': 'Chuuk',
  'Pacific/Ponape': 'Pohnpei',
  // Zones named for a country or for islands: the town the zone is kept for.
  'Indian/Maldives': 'Malé',
  'Indian/Comoro': 'Moroni',
  'Atlantic/Faeroe': 'Tórshavn',
  'Atlantic/Faroe': 'Tórshavn',
  'Atlantic/Canary': 'Las Palmas',
  'Atlantic/Azores': 'Ponta Delgada',
  'America/Cayman': 'George Town',
  'America/St_Johns': 'St. John’s',
}

export function placeOf(zone: string): string {
  return PLACES[zone] ?? zone.split('/').pop()!.replaceAll('_', ' ')
}
