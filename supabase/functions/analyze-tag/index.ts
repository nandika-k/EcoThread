// Photon AI — in-store tag scanner via iMessage
// K2-Think v2 vision: extract brand/materials + score sustainability in one call.
// Dedalus brand audit runs after for certifications.
//
// Photon Spectrum-TS bot: POST application/json { imageUrl, phoneNumber? }
// Twilio MMS fallback:    POST application/x-www-form-urlencoded (From, NumMedia, MediaUrl0…)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const K2_V2_MODEL_ID = Deno.env.get('IFM_MODEL_ID') ?? 'LLM360/K2-Think-v2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const contentType = req.headers.get('content-type') ?? ''
    let imageUrl: string
    let phoneNumber: string | null = null
    let isTwilio = false

    if (contentType.includes('application/x-www-form-urlencoded')) {
      isTwilio = true
      const form = await req.formData()
      phoneNumber = form.get('From') as string | null
      const numMedia = parseInt(form.get('NumMedia') as string ?? '0', 10)

      if (numMedia === 0) {
        return twilioReply('Send a photo of the clothing tag — no image was received.')
      }

      // Use the first image attachment (Twilio can send multiple)
      imageUrl = pickImageUrl(form, numMedia)
      if (!imageUrl) {
        return twilioReply('Could not read the image. Please try again.')
      }
    } else {
      const body = await req.json()
      imageUrl = body.imageUrl
      phoneNumber = body.phoneNumber ?? null

      if (!imageUrl) {
        return new Response(
          JSON.stringify({ error: 'imageUrl is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // K2-Think v2 vision (with one retry on parse failure)
    const k2Result = await analyzeTagWithK2Vision(imageUrl)

    // Dedalus brand audit (certifications, brand rating)
    const dedalus = await fetchDedalusBrandAudit(k2Result.brand)

    const comparison = buildComparison(k2Result.score)

    // Persist scan — best-effort
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )
    supabase.from('tag_scans').insert({
      image_url: imageUrl,
      phone_number: phoneNumber,
      extracted_brand: k2Result.brand,
      extracted_materials: k2Result.materials.map((m: MaterialComponent) => `${m.percentage}% ${m.name}`),
      country_of_origin: k2Result.countryOfOrigin,
      sustainability_score: k2Result.score,
      score_explanation: k2Result.explanation,
    }).then(() => {}).catch(() => {})

    const extraction: TagExtraction = {
      brand: k2Result.brand,
      materials: k2Result.materials,
      countryOfOrigin: k2Result.countryOfOrigin,
      careInstructions: k2Result.careInstructions,
      rawText: k2Result.rawText,
    }

    const smsReply = buildSmsReply({
      extraction,
      score: k2Result.score,
      explanation: k2Result.explanation,
      comparison,
      certifications: dedalus.certifications,
    })

    if (isTwilio) return twilioReply(smsReply)

    return new Response(JSON.stringify({
      extraction,
      score: k2Result.score,
      explanation: k2Result.explanation,
      reasoning: k2Result.reasoning,
      comparison,
      certifications: dedalus.certifications,
      brandRating: dedalus.brand_rating,
      formattedReply: smsReply,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[analyze-tag] error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ─── Types ───────────────────────────────────────────────────

type MaterialComponent = { name: string; percentage: number }

type TagExtraction = {
  brand: string
  materials: MaterialComponent[]
  countryOfOrigin: string | null
  careInstructions: string[]
  rawText: string
}

type K2VisionResult = TagExtraction & {
  score: number
  explanation: string
  reasoning: string
}

// ─── K2-Think v2 vision ───────────────────────────────────────

// Primary prompt: full extraction + scoring
const K2_SYSTEM_PROMPT = `You are a sustainable fashion expert with vision capabilities. Analyze clothing tag and care label images to extract product data and score environmental sustainability.

## Extraction rules

**Brand:**
- Read directly from the tag. If a logo is visible but text is unclear, describe it as best you can.
- US garments often have an RN (Registered Number) or WPL number — note it in rawText but leave brand as the readable brand name.
- Non-English tags: translate brand name if visible, note original language in rawText.
- If truly not visible: "Unknown"

**Materials:**
- List every fiber with its percentage. Percentages MUST sum to exactly 100.
- If the tag shows e.g. "60% Cotton, 40% Polyester" output [{"name":"Cotton","percentage":60},{"name":"Polyester","percentage":40}].
- If total doesn't add to 100 (e.g. shell + lining listed separately), normalize the primary composition to 100.
- Normalize ALL fiber names:
  - POLY / POLYESTER → Polyester
  - REC. POLY / RECYCLED POLYESTER → Recycled Polyester
  - NYLON / POLYAMIDE → Nylon
  - REC. NYLON → Recycled Nylon
  - COTTON / COTON / ALGODÓN → Cotton
  - ORG. COTTON / ORGANIC COTTON → Organic Cotton
  - WOOL / LAINE / LANA → Wool
  - LYOCELL / TENCEL → Tencel/Lyocell
  - VISCOSE / RAYON → Viscose
  - ELASTANE / SPANDEX / LYCRA → Elastane
  - ACRYLIC → Acrylic
  - SILK / SOIE → Silk
  - LINEN / LIN → Linen
  - HEMP / CHANVRE → Hemp
- If no material info is visible: []

**Country of origin:**
- "MADE IN ___", "FABRIQUÉ EN ___", "HECHO EN ___" → extract the country.
- If not visible: null

**Care instructions:**
- Translate care symbols to plain English (e.g. tub icon = "Machine wash", X over tub = "Do not wash").
- Include temperature if visible.

**rawText:** Transcribe ALL text visible on the tag exactly as shown.

## Sustainability scoring (0–100)

Scoring guide:
- 70–100: Highly sustainable
- 40–69: Moderately sustainable
- 0–39: Low sustainability

Material signals:
- Recycled Polyester / Recycled Nylon: +15 vs virgin
- Organic Cotton, Tencel/Lyocell, Hemp, Linen: score 70+
- Conventional Cotton: moderate (50–60 baseline)
- Virgin Polyester, Nylon, Acrylic: score 20–40
- Elastane/Spandex blends: reduce score (prevents recycling)
- Wool, Silk: moderate 45–65 (natural but resource-intensive)
- Mixed recycled + conventional: interpolate

Brand signals:
- Known ethical brands (Patagonia, Eileen Fisher, Stella McCartney, Veja, Allbirds, etc.): +10
- Known fast-fashion brands (Shein, Zara, H&M, etc.): −10
- Unknown brand: neutral

Origin signals:
- Made in Portugal, Italy, USA, Canada: slight positive (higher labour standards)
- Made in Bangladesh, Cambodia, Vietnam: neutral (common, not inherently bad)
- No origin listed: slight negative

## Output format

Reason step by step, then output EXACTLY ONE JSON object on its own line (no trailing commas, valid JSON):
{"brand":"<string>","materials":[{"name":"<string>","percentage":<number>}],"countryOfOrigin":<string|null>,"careInstructions":["<string>"],"rawText":"<string>","score":<number>,"explanation":"<one sentence>","reasoning":"<2-3 sentences>"}`

// Retry prompt: used when the primary response fails to parse
const K2_RETRY_PROMPT = `Your previous response could not be parsed as JSON. Output ONLY the following JSON object with no other text, no markdown, no explanation:
{"brand":"...","materials":[{"name":"...","percentage":0}],"countryOfOrigin":null,"careInstructions":[],"rawText":"...","score":0,"explanation":"...","reasoning":"..."}`

async function analyzeTagWithK2Vision(imageUrl: string): Promise<K2VisionResult> {
  const endpoint = Deno.env.get('IFM_API_URL')
  if (!endpoint) return visionFallback('No IFM_API_URL configured')

  // Attempt 1 — full prompt
  const attempt1 = await callK2Vision(endpoint, imageUrl, K2_SYSTEM_PROMPT)
  if (attempt1) return normalizeMaterials(attempt1)

  // Attempt 2 — retry prompt (asks model to output clean JSON only)
  console.warn('[K2v2] Attempt 1 parse failed — retrying with simplified prompt')
  const attempt2 = await callK2Vision(endpoint, imageUrl, K2_RETRY_PROMPT)
  if (attempt2) return normalizeMaterials(attempt2)

  console.warn('[K2v2] Both attempts failed — using fallback')
  return visionFallback('K2-Think v2 did not return parseable JSON after 2 attempts')
}

async function callK2Vision(
  endpoint: string,
  imageUrl: string,
  systemPrompt: string,
): Promise<K2VisionResult | null> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('IFM_API_KEY') ?? 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: K2_V2_MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: 'Analyze this clothing tag.' },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.2,
      }),
    })

    if (!res.ok) {
      console.warn(`[K2v2] HTTP ${res.status}`)
      return null
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    if (!content) return null

    const parsed = extractLastJson(content)
    if (!parsed || typeof parsed.score !== 'number') return null

    return {
      brand: String(parsed.brand ?? 'Unknown'),
      materials: (parsed.materials ?? []) as MaterialComponent[],
      countryOfOrigin: parsed.countryOfOrigin ? String(parsed.countryOfOrigin) : null,
      careInstructions: (parsed.careInstructions ?? []) as string[],
      rawText: String(parsed.rawText ?? ''),
      score: Math.round(Math.max(0, Math.min(100, Number(parsed.score)))),
      explanation: String(parsed.explanation ?? 'Score estimated from fabric composition.'),
      reasoning: String(parsed.reasoning ?? parsed.explanation ?? ''),
    }
  } catch (err) {
    console.warn('[K2v2] callK2Vision error:', err)
    return null
  }
}

// Normalize material percentages to sum to exactly 100
function normalizeMaterials(result: K2VisionResult): K2VisionResult {
  const materials = result.materials
  if (materials.length === 0) return result

  const total = materials.reduce((sum, m) => sum + m.percentage, 0)
  if (total === 0) return result
  if (Math.abs(total - 100) <= 1) return result  // close enough

  const normalized = materials.map((m) => ({
    name: m.name,
    percentage: Math.round((m.percentage / total) * 100),
  }))

  // Fix rounding drift: add/subtract from the largest component
  const drift = 100 - normalized.reduce((sum, m) => sum + m.percentage, 0)
  if (drift !== 0) {
    const largest = normalized.reduce((max, m, i, arr) => m.percentage > arr[max].percentage ? i : max, 0)
    normalized[largest].percentage += drift
  }

  return { ...result, materials: normalized }
}

function visionFallback(reason = ''): K2VisionResult {
  if (reason) console.warn('[K2v2] fallback:', reason)
  return {
    brand: 'Unknown',
    materials: [],
    countryOfOrigin: null,
    careInstructions: [],
    rawText: '',
    score: 50,
    explanation: 'Tag could not be analyzed — score is a neutral estimate.',
    reasoning: reason || 'K2-Think v2 unavailable.',
  }
}

// ─── JSON extraction ─────────────────────────────────────────
// K2-Think emits chain-of-thought before the final JSON verdict.
// Handles: code fences, bare JSON, deeply nested objects.

function extractLastJson(text: string): Record<string, unknown> | null {
  // 1. Try ```json ... ``` code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    try {
      const obj = JSON.parse(fenceMatch[1].trim())
      if (obj && typeof obj === 'object') return obj
    } catch {}
  }

  // 2. Scan backwards: find the last top-level { } block
  let depth = 0
  let end = -1
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === '}') {
      depth++
      if (end === -1) end = i
    } else if (ch === '{') {
      depth--
      if (depth === 0 && end !== -1) {
        const candidate = text.slice(i, end + 1)
        try {
          const obj = JSON.parse(candidate)
          if (obj && typeof obj === 'object') return obj
        } catch {
          // This slice wasn't valid JSON — keep scanning for an earlier {
          end = -1
          depth = 0
        }
      }
    }
  }

  return null
}

// ─── Dedalus Labs ────────────────────────────────────────────

type DedalusResult = { brand_rating: string; certifications: string[]; notes: string }

async function fetchDedalusBrandAudit(brand: string): Promise<DedalusResult> {
  const fallback: DedalusResult = { brand_rating: 'unknown', certifications: [], notes: '' }
  if (brand === 'Unknown') return fallback

  try {
    const res = await fetch('https://api.dedaluslabs.ai/v1/audit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('DEDALUS_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brand, sources: ['goodonyou.eco', 'bcorporation.net', 'fairlabor.org'] }),
    })
    if (!res.ok) return fallback
    return await res.json()
  } catch {
    return fallback
  }
}

// ─── Twilio helpers ───────────────────────────────────────────

// Pick the first image/video attachment from Twilio's multi-media payload
function pickImageUrl(form: FormData, numMedia: number): string {
  for (let i = 0; i < Math.min(numMedia, 10); i++) {
    const mime = form.get(`MediaContentType${i}`) as string | null
    const url  = form.get(`MediaUrl${i}`) as string | null
    if (url && mime?.startsWith('image/')) return url
  }
  // Fallback: return first URL regardless of content type
  return form.get('MediaUrl0') as string ?? ''
}

// ─── Helpers ─────────────────────────────────────────────────

function buildComparison(score: number): string {
  if (score >= 70) return `saves ~${Math.round(score * 0.3)} kg CO₂ vs buying new`
  if (score >= 40) return `saves ~${Math.round(score * 0.15)} kg CO₂ vs buying new`
  return 'minimal CO₂ savings vs buying new'
}

function buildSmsReply(input: {
  extraction: TagExtraction
  score: number
  explanation: string
  comparison: string
  certifications: string[]
}): string {
  const { extraction, score, explanation, comparison, certifications } = input
  const scoreEmoji = score >= 70 ? '🌿' : score >= 40 ? '🟡' : '🔴'
  const materialsLine = extraction.materials.length > 0
    ? extraction.materials.map((m) => `${m.percentage}% ${m.name}`).join(', ')
    : 'Unknown'

  const lines = [
    `${scoreEmoji} Sustainability Score: ${score}/100`,
    `Brand: ${extraction.brand}`,
    `Materials: ${materialsLine}`,
  ]
  if (extraction.countryOfOrigin) lines.push(`Made in: ${extraction.countryOfOrigin}`)
  lines.push('', explanation, comparison)
  if (certifications.length > 0) lines.push(`Certs: ${certifications.join(', ')}`)
  lines.push('', 'Powered by Photon AI')
  return lines.join('\n')
}

function twilioReply(message: string): Response {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  )
}
