import type { Tables } from '../integrations/supabase/types'

type ProfileRow = Tables<'profiles'>
type StylePreferenceRow = Tables<'style_preferences'>

export type Profile = ProfileRow
export type StylePreference = Omit<StylePreferenceRow, 'style_tags' | 'occasions'> & {
  style_tags: string[]
  occasions: string[]
}

export const STYLE_TAGS = [
  'Y2K',
  'Vintage 90s',
  'Streetwear',
  'Boho',
  'Dark Academia',
  'Cottagecore',
  'Minimalist',
] as const

export const OCCASIONS = [
  'Prom',
  'Wedding',
  'Everyday',
  'Work',
  'Date Night',
] as const

export type StyleTag = typeof STYLE_TAGS[number]
export type Occasion = typeof OCCASIONS[number]
