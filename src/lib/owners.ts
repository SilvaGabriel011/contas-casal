import type { HouseholdSettings, Owner } from '../types'
import type { TKey } from './i18n'

export function personName(owner: 'a' | 'b', settings: HouseholdSettings): string {
  return owner === 'a' ? settings.nameA : settings.nameB
}

export function ownerLabel(
  owner: Owner,
  settings: HouseholdSettings,
  t: (key: TKey) => string
): string {
  return owner === 'shared' ? t('couple') : personName(owner, settings)
}
