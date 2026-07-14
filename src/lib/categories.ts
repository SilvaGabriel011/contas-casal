import type { HouseholdSettings } from '../types'
import { CATEGORY_EMOJI } from '../types'
import type { TKey } from './i18n'

export const CAT_KEY: Record<string, TKey> = {
  rent: 'catRent',
  utilities: 'catUtilities',
  internet: 'catInternet',
  phone: 'catPhone',
  groceries: 'catGroceries',
  food: 'catFood',
  household: 'catHousehold',
  shopping: 'catShopping',
  transport: 'catTransport',
  car: 'catCar',
  health: 'catHealth',
  insurance: 'catInsurance',
  education: 'catEducation',
  card: 'catCard',
  streaming: 'catStreaming',
  gym: 'catGym',
  pet: 'catPet',
  tax: 'catTax',
  travel: 'catTravel',
  gift: 'catGift',
  other: 'catOther',
}

export function categoryEmoji(category: string, settings: HouseholdSettings): string {
  const custom = settings.customCategories.find((c) => c.id === category)
  return custom?.emoji || CATEGORY_EMOJI[category] || '📦'
}

export function categoryLabel(
  category: string,
  settings: HouseholdSettings,
  t: (key: TKey) => string
): string {
  const custom = settings.customCategories.find((c) => c.id === category)
  if (custom) return custom.label
  const key = CAT_KEY[category]
  return key ? t(key) : category
}
