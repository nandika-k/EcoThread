export type ListingCandidate = {
  id?: string
  retailer?: string | null
  title?: string | null
  description?: string | null
  price?: number | null
  currency?: string | null
  image_urls?: string[] | null
  product_url?: string | null
  sustainability_score?: number | null
  score_explanation?: string | null
  metadata?: unknown
  last_updated?: string
}

export type ExtractedPrice = {
  price: number | null
  currency: string | null
}

type RetailerRule = {
  domains: string[]
  allowedPathPatterns: RegExp[]
  blockedPathPatterns?: RegExp[]
  searchHints: string[]
}

const DOCUMENT_EXTENSION_PATTERN = /\.(?:pdf|doc|docx|ppt|pptx|xls|xlsx)(?:$|[?#])/i
const GOOGLE_HOST_PATTERN = /(^|\.)google\./i
const IMAGE_EXTENSION_BLOCK_PATTERN = /\.(?:svg|gif|ico)(?:$|[?#])/i
const IMAGE_ASSET_PATTERN = /(logo|icon|favicon|avatar|placeholder|sprite|pixel|badge|shield|default-user|transparent|meta-preview-image)/i
const PRICE_MATCH_PATTERN = /\b(?:(USD|US|GBP|EUR|CAD|AUD)\s*)?(\$|£|€)\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)|\b(USD|GBP|EUR|CAD|AUD)\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/gi
const PRICE_POSITIVE_CONTEXT_PATTERN = /\b(price|now|sale|selling for|buy it now|asking|listed for|offer|current bid|current price)\b/i
const PRICE_NEGATIVE_CONTEXT_PATTERN = /\b(shipping|delivery|tax|fee|fees|buyer protection|protection|deposit)\b/i
const PRICE_OLD_CONTEXT_PATTERN = /\b(was|original|retail|compare at|msrp|valued at)\b/i
const PRICE_DISCOUNT_CONTEXT_PATTERN = /\b(discount|off|sale)\b/i
const TRACKING_QUERY_PARAMS = new Set([
  'amdata',
  'campid',
  'customid',
  'fbclid',
  'gclid',
  'mkcid',
  'mkevt',
  'mkrid',
  'pla_feed',
  'referrer',
  'srsltid',
  'toolid',
  '_trkparms',
  '_trksid',
])
const STATIC_ASSET_HOST_PATTERNS = [
  /^ir\.ebaystatic\.com$/i,
  /^marketplace-web-assets\.vinted\.com$/i,
]
const GLOBAL_BLOCKED_PATH_PATTERNS = [
  /\/blog(?:\/|$)/i,
  /\/catalog(?:\/|$)/i,
  /\/collections?(?:\/|$)/i,
  /\/editorial(?:\/|$)/i,
  /\/journal(?:\/|$)/i,
  /\/news(?:\/|$)/i,
  /\/newsroom(?:\/|$)/i,
  /\/press(?:\/|$)/i,
  /\/report(?:s)?(?:\/|$)/i,
  /\/documents?(?:\/|$)/i,
  /\/sustainability(?:\/|$)/i,
  /\/brands?(?:\/|$)/i,
  /\/shops?(?:\/|$)/i,
  /\/categories?(?:\/|$)/i,
  /\/search(?:\/|$)/i,
  /\/theme(?:\/|$)/i,
]
const SEARCH_NEGATIONS = [
  '-pdf',
  '-blog',
  '-catalog',
  '-collection',
  '-news',
  '-newsroom',
  '-journal',
  '-report',
  '-press',
  '-brand',
  '-brands',
  '-shop',
  '-shops',
  '-category',
  '-categories',
  '-theme',
  '-search',
].join(' ')
const RETAILER_IMAGE_HOST_PATTERNS: Record<string, RegExp[]> = {
  depop: [/depop\./i],
  vinted: [/\.vinted\.net$/i],
  ebay: [/^i\.ebayimg\.com$/i],
  thredup: [/thredup\./i],
  vestiaire: [/vestiaire/i],
  whatnot: [/whatnot/i],
}

const RETAILER_RULES: Record<string, RetailerRule> = {
  depop: {
    domains: ['depop.com'],
    allowedPathPatterns: [/^\/products\//i],
    blockedPathPatterns: [/^\/search\//i, /^\/theme\//i],
    searchHints: ['"/products/"', '"secondhand fashion listing"'],
  },
  vinted: {
    domains: ['vinted.com'],
    allowedPathPatterns: [/^\/items\//i],
    blockedPathPatterns: [/^\/brand\//i, /^\/catalog\//i, /^\/member\//i],
    searchHints: ['"/items/"', '"preowned clothing listing"'],
  },
  ebay: {
    domains: ['ebay.com'],
    allowedPathPatterns: [/^\/itm\//i],
    blockedPathPatterns: [/^\/b\//i, /^\/sch\//i, /^\/shop\//i, /^\/str\//i],
    searchHints: ['"/itm/"', '"used clothing listing"', '"Buy It Now"'],
  },
  thredup: {
    domains: ['thredup.com'],
    allowedPathPatterns: [],
    blockedPathPatterns: [/^\/bg\/p\//i],
    searchHints: ['"secondhand clothing item"'],
  },
  vestiaire: {
    domains: ['vestiairecollective.com'],
    allowedPathPatterns: [],
    searchHints: ['"designer resale item"'],
  },
  whatnot: {
    domains: ['whatnot.com'],
    allowedPathPatterns: [/^\/listing\//i],
    blockedPathPatterns: [/^\/category\//i, /^\/clip\//i, /^\/seller\//i],
    searchHints: ['"/listing/"', '"preowned apparel listing"'],
  },
}

export function buildRetailerSearchQuery(query: string, retailer: string, domain: string): string {
  const normalizedRetailer = retailer.trim().toLowerCase()
  const retailerRule = RETAILER_RULES[normalizedRetailer]

  return [
    query.trim(),
    `site:${domain}`,
    ...(retailerRule?.searchHints ?? []),
    SEARCH_NEGATIONS,
  ]
    .filter(Boolean)
    .join(' ')
}

export function normalizeListingPrice(price: number | null | undefined): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null
  }

  return Number(price.toFixed(2))
}

export function extractListingPrice(...textSources: Array<string | null | undefined>): ExtractedPrice {
  const haystack = textSources
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')

  if (!haystack) {
    return { price: null, currency: null }
  }

  const candidates: Array<ExtractedPrice & { index: number; score: number }> = []
  PRICE_MATCH_PATTERN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = PRICE_MATCH_PATTERN.exec(haystack)) !== null) {
    const amountText = match[3] ?? match[5]
    const normalizedPrice = normalizeListingPrice(parsePriceNumber(amountText))

    if (normalizedPrice == null) {
      continue
    }

    const contextStart = Math.max(0, match.index - 48)
    const contextEnd = Math.min(haystack.length, match.index + match[0].length + 48)
    const context = haystack.slice(contextStart, contextEnd).toLowerCase()
    let score = 100 - Math.min(match.index, 480) / 24

    if (PRICE_POSITIVE_CONTEXT_PATTERN.test(context)) {
      score += 45
    }

    if (PRICE_DISCOUNT_CONTEXT_PATTERN.test(context)) {
      score += 25
    }

    if (PRICE_NEGATIVE_CONTEXT_PATTERN.test(context)) {
      score -= 65
    }

    if (PRICE_OLD_CONTEXT_PATTERN.test(context)) {
      score -= 35
    }

    if (normalizedPrice >= 3 && normalizedPrice <= 5000) {
      score += 10
    }

    candidates.push({
      price: normalizedPrice,
      currency: normalizeCurrencyCode(match[1] ?? match[4], match[2]),
      index: match.index,
      score,
    })
  }

  candidates.sort((left, right) =>
    right.score - left.score ||
    left.price! - right.price! ||
    left.index - right.index
  )

  const best = candidates[0]
  if (!best || best.score < 20) {
    return { price: null, currency: null }
  }

  return {
    price: best.price,
    currency: best.currency ?? 'USD',
  }
}

export function normalizeListingCandidate<T extends ListingCandidate>(
  candidate: T,
  retailerHint?: string,
): T | null {
  const retailer = (retailerHint ?? candidate.retailer ?? '').trim().toLowerCase()
  const retailerRule = RETAILER_RULES[retailer]
  const title = normalizeText(candidate.title)
  const rawUrl = normalizeText(candidate.product_url)

  if (!retailerRule || !title || title.toLowerCase() === 'untitled' || !rawUrl) {
    return null
  }

  let productUrl: URL
  try {
    productUrl = new URL(rawUrl)
  } catch {
    return null
  }

  const hostname = productUrl.hostname.toLowerCase()
  const pathname = productUrl.pathname.toLowerCase()

  if (
    (productUrl.protocol !== 'http:' && productUrl.protocol !== 'https:') ||
    GOOGLE_HOST_PATTERN.test(hostname) ||
    DOCUMENT_EXTENSION_PATTERN.test(productUrl.pathname) ||
    title.toLowerCase().includes('[pdf]') ||
    !retailerRule.domains.some((domain) => hostnameMatches(hostname, domain)) ||
    GLOBAL_BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    (retailerRule.blockedPathPatterns ?? []).some((pattern) => pattern.test(pathname)) ||
    retailerRule.allowedPathPatterns.length === 0 ||
    !retailerRule.allowedPathPatterns.some((pattern) => pattern.test(pathname))
  ) {
    return null
  }

  const fallbackPrice = extractListingPrice(title, candidate.description)
  const normalizedPrice = normalizeListingPrice(candidate.price) ?? fallbackPrice.price

  return {
    ...candidate,
    retailer,
    title,
    description: normalizeText(candidate.description),
    price: normalizedPrice,
    currency: normalizedPrice == null
      ? null
      : normalizeCurrency(candidate.currency) ?? fallbackPrice.currency ?? 'USD',
    image_urls: normalizeListingImageUrls(candidate.image_urls, retailer),
    product_url: normalizeProductUrl(productUrl),
  }
}

export function filterValidatedListings<T extends ListingCandidate>(
  products: T[],
  search: string,
  retailer: string | null,
): T[] {
  const normalizedRetailer = retailer && retailer !== 'all' ? retailer.toLowerCase() : null
  const normalizedSearch = search.trim().toLowerCase()
  const deduped = new Map<string, T>()

  for (const product of products) {
    const normalized = normalizeListingCandidate(product)
    if (!normalized) {
      continue
    }

    if (normalizedRetailer && normalized.retailer !== normalizedRetailer) {
      continue
    }

    if (normalizedSearch) {
      const haystack = `${normalized.title ?? ''} ${normalized.description ?? ''} ${normalized.retailer ?? ''}`
        .toLowerCase()
      if (!haystack.includes(normalizedSearch)) {
        continue
      }
    }

    const key = normalized.id ?? normalized.product_url ?? `${normalized.retailer}:${normalized.title}`
    if (!deduped.has(key)) {
      deduped.set(key, normalized)
    }
  }

  return Array.from(deduped.values())
}

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

export function normalizeListingImageUrls(
  imageUrls: string[] | null | undefined,
  retailerHint?: string,
): string[] {
  if (!Array.isArray(imageUrls)) {
    return []
  }

  const retailer = retailerHint?.trim().toLowerCase() ?? null
  const preferredHosts = retailer ? RETAILER_IMAGE_HOST_PATTERNS[retailer] ?? [] : []
  const deduped = new Map<string, { score: number; url: string }>()

  for (const imageUrl of imageUrls) {
    if (typeof imageUrl !== 'string') {
      continue
    }

    let parsed: URL
    try {
      parsed = new URL(imageUrl)
    } catch {
      continue
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue
    }

    const hostname = parsed.hostname.toLowerCase()
    const pathname = parsed.pathname.toLowerCase()

    if (
      IMAGE_EXTENSION_BLOCK_PATTERN.test(pathname) ||
      IMAGE_ASSET_PATTERN.test(hostname) ||
      IMAGE_ASSET_PATTERN.test(pathname) ||
      pathname.includes('/_next/static/media/') ||
      STATIC_ASSET_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
    ) {
      continue
    }

    const normalizedUrl = normalizeImageUrl(parsed, retailer)
    const score = scoreImageUrl(parsed, preferredHosts)
    if (score < 0) {
      continue
    }

    const existing = deduped.get(normalizedUrl)
    if (!existing || score > existing.score) {
      deduped.set(normalizedUrl, { score, url: normalizedUrl })
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.score - left.score || right.url.length - left.url.length)
    .slice(0, 6)
    .map((entry) => entry.url)
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)?.toUpperCase() ?? null
  if (!normalized) {
    return null
  }

  if (normalized === 'US') {
    return 'USD'
  }

  return /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

function normalizeCurrencyCode(value: string | undefined, symbol: string | undefined): string | null {
  const normalizedValue = normalizeCurrency(value)
  if (normalizedValue) {
    return normalizedValue
  }

  if (symbol === '$') {
    return 'USD'
  }

  if (symbol === '£') {
    return 'GBP'
  }

  if (symbol === '€') {
    return 'EUR'
  }

  return null
}

function normalizeProductUrl(productUrl: URL): string {
  const normalized = new URL(productUrl.toString())
  normalized.hash = ''

  for (const key of Array.from(normalized.searchParams.keys())) {
    const lowerKey = key.toLowerCase()
    if (TRACKING_QUERY_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
      normalized.searchParams.delete(key)
    }
  }

  return normalized.toString()
}

function normalizeImageUrl(imageUrl: URL, retailer: string | null): string {
  const normalized = new URL(imageUrl.toString())
  normalized.hash = ''

  if (retailer === 'ebay' && normalized.hostname.toLowerCase() === 'i.ebayimg.com') {
    normalized.pathname = normalized.pathname.replace(
      /\/s-l(?:140|160|225|300|400|500|640|960|1200)(\.[a-z0-9]+)$/i,
      '/s-l1600$1',
    )
  }

  return normalized.toString()
}

function scoreImageUrl(imageUrl: URL, preferredHosts: RegExp[]): number {
  const hostname = imageUrl.hostname.toLowerCase()
  const pathname = imageUrl.pathname.toLowerCase()
  let score = 0

  if (preferredHosts.some((pattern) => pattern.test(hostname))) {
    score += 50
  }

  if (/\.(?:jpe?g|png|webp)$/i.test(pathname)) {
    score += 10
  }

  if (/\/f800\//i.test(pathname) || /s-l1600/i.test(pathname)) {
    score += 30
  } else if (/\/\d{3,4}x\d{3,4}\//i.test(pathname) || /s-l(?:400|500|640|960|1200)/i.test(pathname)) {
    score += 18
  } else if (/s-l140/i.test(pathname)) {
    score += 4
  }

  if (pathname.includes('stockimage')) {
    score -= 80
  }

  return score
}

function parsePriceNumber(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}
