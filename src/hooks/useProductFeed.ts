import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { FEED_PAGE_SIZE, getRecommendationsLocal } from '../lib/rewear-store'

type FeedInput = {
  search: string
  retailer: string
}

export function useProductFeed(input: FeedInput) {
  const { user } = useAuth()

  return useInfiniteQuery({
    queryKey: ['feed', user?.id, input.search, input.retailer],
    enabled: Boolean(user),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getRecommendationsLocal({
        userId: user!.id,
        search: input.search,
        retailer: input.retailer,
        page: Number(pageParam),
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < FEED_PAGE_SIZE) return undefined
      return allPages.length
    },
  })
}
