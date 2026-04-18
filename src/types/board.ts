import type { Tables } from '../integrations/supabase/types'
import type { Product } from './product'

export type Board = Tables<'boards'>

type PinRow = Tables<'pins'>

export type Pin = Omit<PinRow, 'product_data'> & {
  product_data: Product
}
