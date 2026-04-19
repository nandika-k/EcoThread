import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SECONDHAND_RETAILERS = new Set(['depop', 'vinted', 'thredup', 'vestiaire', 'ebay', 'whatnot'])
const K2_MODEL_ID = 'LLM360/K2-Think'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { productId, product: providedProduct } = await req.json()

    if (!productId) {
      return new Response(
        JSON.stringify({ error: 'productId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Get product
    const { data: existingProduct, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle()

    if (productError) {
      return new Response(
        JSON.stringify({ error: getErrorMessage(productError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let product = existingProduct

    if (!product && providedProduct) {
      const normalizedProduct = normalizeInputProduct(providedProduct, productId)
      const { data: insertedProduct, error: insertError } = await supabase
        .from('products')
        .upsert({
          ...normalizedProduct,
          last_updated: new Date().toISOString(),
          metadata: normalizedProduct.metadata ?? null,
        })
        .select('*')
        .single()

      if (insertError) {
        return new Response(
          JSON.stringify({ error: getErrorMessage(insertError) }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      product = insertedProduct
    }

    if (!product) {
      return new Response(
        JSON.stringify({ error: `Product not found: ${productId}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return cached score if exists.
    if (
      product.sustainability_score !== null &&
      product.score_explanation !== null &&
      !isFallbackScore(product.score_explanation)
    ) {
      const score = product.sustainability_score
      const metadata = getProductMetadata(product.metadata)
      return new Response(JSON.stringify({
        score,
        explanation: product.score_explanation,
        reasoning: metadata.scoring_reasoning ?? product.score_explanation,
        comparison: buildComparison(score),
        carbon_kg: carbonKg(score),
        fabric_type: extractFabric(product.title + ' ' + (product.description ?? '')),
        condition: extractCondition(product.description ?? ''),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 1: Dedalus brand audit.
    const dedalus = await fetchDedalusBrandAudit(product.retailer, product.title)

    // Step 2: K2-Think scoring.
    const ifmResult = await fetchIFMScore({
      title: product.title,
      description: product.description ?? '',
      retailer: product.retailer,
      isSecondhand: SECONDHAND_RETAILERS.has(product.retailer),
      brandRating: dedalus.brand_rating,
      certifications: dedalus.certifications,
      brandNotes: dedalus.notes,
    })

    // Step 3: Persist result.
    if (ifmResult.source === 'live') {
      await supabase
        .from('products')
        .update({
          sustainability_score: ifmResult.score,
          score_explanation: ifmResult.explanation,
          metadata: {
            ...getProductMetadata(product.metadata),
            scoring_model: K2_MODEL_ID,
            scoring_reasoning: ifmResult.reasoning,
            scoring_source: 'live',
            scored_at: new Date().toISOString(),
          },
        })
        .eq('id', productId)
    }

    const score = ifmResult.score
    return new Response(JSON.stringify({
      score,
      explanation: ifmResult.explanation,
      reasoning: ifmResult.reasoning,
      comparison: buildComparison(score),
      carbon_kg: carbonKg(score),
      fabric_type: ifmResult.fabric_type ?? extractFabric(product.title + ' ' + (product.description ?? '')),
      condition: ifmResult.condition ?? extractCondition(product.description ?? ''),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in calculate-sustainability:', error)
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Dedalus Labs brand audit
async function fetchDedalusBrandAudit(retailer: string, productTitle: string): Promise<any> {
  const apiKey = Deno.env.get('DEDALUS_API_KEY')
  const brand = extractBrand(productTitle)

  try {
    const res = await fetch('https://api.dedaluslabs.ai/v1/audit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand,
        retailer,
        sources: ['goodonyou.eco', 'bcorporation.net', 'fairlabor.org'],
      }),
    })

    if (!res.ok) {
      return { brand_rating: 'unknown', certifications: [], notes: '' }
    }

    return await res.json()
  } catch {
    return { brand_rating: 'unknown', certifications: [], notes: '' }
  }
}

// K2-Think reasoning and scoring
async function fetchIFMScore(input: any): Promise<any> {
  const apiKey = Deno.env.get('IFM_API_KEY')
  const endpoint = Deno.env.get('IFM_API_URL')

  // No IFM endpoint - use retailer heuristic.
  if (!endpoint) return retailerFallback(input)

  const secondhandContext = input.isSecondhand
    ? 'This item is sold on a secondhand marketplace, which significantly reduces its carbon footprint compared to buying new.'
    : ''

  const systemPrompt = `You are a sustainable fashion expert. Reason through the product's sustainability factors step by step, then output a final JSON verdict.

Scoring guide:
- 70-100: Highly sustainable (secondhand, strong ethical brand, certified materials)
- 40-69: Moderately sustainable
- 0-39: Low sustainability

After your reasoning, output exactly one JSON object on its own line:
{"score": <0-100>, "explanation": "<one-sentence summary>", "reasoning": "<2-3 sentence detail>", "fabric_type": "<primary fabric e.g. denim, cotton, wool, polyester, or null if unknown>", "condition": "<Excellent|Good|Fair|New or null if unknown>"}`

  const userPrompt = `Product: ${input.title}
Description: ${input.description}
Retailer: ${input.retailer}
${secondhandContext}
Brand sustainability rating: ${input.brandRating}
Certifications: ${input.certifications.join(', ') || 'none found'}
Brand notes: ${input.brandNotes || 'none'}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey ?? 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: K2_MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[IFM] K2-Think ${res.status}: ${body.slice(0, 200)} - using fallback`)
      return retailerFallback(input)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.warn('[IFM] K2-Think response missing content - using fallback')
      return retailerFallback(input)
    }

    const parsed = extractTrailingJson(content)
    return {
      score: parsed.score,
      explanation: parsed.explanation,
      reasoning: parsed.reasoning ?? parsed.explanation,
      source: 'live',
    }
  } catch (err) {
    console.warn('[IFM] K2-Think call errored - using fallback:', err)
    return retailerFallback(input)
  }
}

function retailerFallback(input: any): any {
  const score = input.isSecondhand ? 65 : 35
  return {
    score,
    explanation: input.isSecondhand
      ? 'Secondhand item — estimated sustainability based on reuse.'
      : 'New retail item — estimated sustainability based on category.',
    reasoning: 'Live K2-Think scoring unavailable; score estimated from retailer type.',
    source: 'fallback',
    fabric_type: extractFabric(input.title + ' ' + input.description),
    condition: extractCondition(input.description),
  }
}

function normalizeInputProduct(product: any, productId: string): any {
  return {
    id: productId,
    retailer: product.retailer ?? 'unknown',
    title: product.title ?? 'Untitled',
    description: product.description ?? null,
    price: product.price ?? null,
    currency: product.currency ?? 'USD',
    image_urls: Array.isArray(product.image_urls) ? product.image_urls : [],
    product_url: product.product_url ?? '',
    sustainability_score: product.sustainability_score ?? null,
    score_explanation: product.score_explanation ?? null,
    metadata: product.metadata ?? null,
  }
}

function extractTrailingJson(text: string): any {
  const matches = text.match(/\{[^{}]*"score"[^{}]*\}/g)
  if (!matches || matches.length === 0) {
    throw new Error('K2-Think response missing JSON verdict')
  }
  return JSON.parse(matches[matches.length - 1])
}

function extractBrand(title: string): string {
  return title.split(' ')[0] ?? title
}

function buildComparison(score: number): string {
  if (score >= 70) return `saves ~${Math.round(score * 0.3)} kg CO2 vs buying new`
  if (score >= 40) return `saves ~${Math.round(score * 0.15)} kg CO2 vs buying new`
  return 'minimal CO2 savings vs buying new'
}

function carbonKg(score: number): number {
  if (score >= 70) return Math.round(score * 0.3)
  if (score >= 40) return Math.round(score * 0.15)
  return 2
}

function extractFabric(text: string): string | null {
  const t = text.toLowerCase()
  const fabrics = ['cashmere', 'wool', 'silk', 'linen', 'cotton', 'denim', 'polyester', 'viscose', 'rayon', 'nylon', 'spandex', 'leather', 'suede', 'velvet', 'corduroy', 'satin', 'chiffon']
  for (const f of fabrics) {
    if (t.includes(f)) return f.charAt(0).toUpperCase() + f.slice(1)
  }
  return null
}

function extractCondition(text: string): string | null {
  const t = text.toLowerCase()
  if (t.includes('new with tags') || t.includes('nwt')) return 'New w/ Tags'
  if (t.includes('excellent') || t.includes('mint')) return 'Excellent'
  if (t.includes('good') || t.includes('great')) return 'Good'
  if (t.includes('fair') || t.includes('worn') || t.includes('used')) return 'Fair'
  return 'Good'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function getProductMetadata(metadata: unknown): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

function isFallbackScore(explanation: string): boolean {
  const normalized = explanation.toLowerCase()
  return normalized.includes('estimated sustainability') ||
    normalized.includes('score estimated from retailer type') ||
    normalized.includes('live k2-think scoring unavailable')
}
