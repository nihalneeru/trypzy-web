/**
 * Derive packing suggestions from accepted itinerary
 * Rule-based: scans itinerary content for activity keywords, season,
 * and trip duration to suggest relevant packing items.
 *
 * Used as fallback when LLM cache is unavailable or LLM fails.
 *
 * @param {Object} params
 * @param {Object} params.itinerary - Itinerary object with days array
 * @param {string} [params.startDate] - Trip start date (ISO string or YYYY-MM-DD)
 * @param {number} [params.durationDays] - Number of trip days
 * @returns {Array} Array of { slug, title, category, notes }
 */
export function derivePackingSuggestionsFromItinerary({
  itinerary,
  startDate = null,
  durationDays = null
}) {
  const matched = new Set()
  const suggestions = []

  function add(slug, title, category, notes) {
    if (matched.has(slug)) return
    matched.add(slug)
    suggestions.push({ slug, title, category: category || 'general', notes: notes || null })
  }

  // ── Collect all text from itinerary blocks ──
  const allText = []
  if (itinerary && itinerary.days && Array.isArray(itinerary.days)) {
    for (const day of itinerary.days) {
      if (day.title) allText.push(day.title)
      if (day.blocks && Array.isArray(day.blocks)) {
        for (const block of day.blocks) {
          if (block.title) allText.push(block.title)
          if (block.description) allText.push(block.description)
          if (block.tags && Array.isArray(block.tags)) allText.push(block.tags.join(' '))
          if (block.transitNotes) allText.push(block.transitNotes)
        }
      }
    }
  }

  const corpus = allText.join(' ').toLowerCase()

  // ── Keyword → packing item mappings ──

  const KEYWORD_RULES = [
    // Beach / water
    { patterns: ['beach', 'snorkel', 'surf', 'swim', 'ocean', 'coast', 'seaside', 'waterfront'], items: [
      { slug: 'swimsuit', title: 'Swimsuit', category: 'clothing' },
      { slug: 'sunscreen', title: 'Sunscreen (SPF 30+)', category: 'toiletries', notes: 'Reef-safe if snorkeling' },
      { slug: 'beach_towel', title: 'Beach towel or sarong', category: 'accessories' },
      { slug: 'flip_flops', title: 'Flip-flops / sandals', category: 'footwear' },
      { slug: 'sunglasses', title: 'Sunglasses', category: 'accessories' },
    ]},
    // Hiking / outdoors
    { patterns: ['hike', 'hiking', 'trek', 'trekking', 'trail', 'mountain', 'nature walk', 'national park'], items: [
      { slug: 'hiking_boots', title: 'Hiking boots or sturdy shoes', category: 'footwear' },
      { slug: 'daypack', title: 'Daypack / backpack', category: 'accessories' },
      { slug: 'water_bottle', title: 'Reusable water bottle', category: 'accessories' },
      { slug: 'hat_sun', title: 'Sun hat or cap', category: 'accessories' },
    ]},
    // Formal / dining
    { patterns: ['formal', 'gala', 'dinner reserv', 'fine dining', 'dress code', 'cocktail', 'theatre', 'theater', 'opera'], items: [
      { slug: 'formal_outfit', title: 'Formal or smart-casual outfit', category: 'clothing' },
      { slug: 'dress_shoes', title: 'Dress shoes', category: 'footwear' },
    ]},
    // Cold / winter / ski
    { patterns: ['ski', 'skiing', 'snowboard', 'snow', 'ice skat', 'winter sport', 'cold weather'], items: [
      { slug: 'warm_jacket', title: 'Warm jacket / puffer', category: 'clothing' },
      { slug: 'thermal_layers', title: 'Thermal base layers', category: 'clothing' },
      { slug: 'gloves', title: 'Gloves', category: 'accessories' },
      { slug: 'beanie', title: 'Beanie / warm hat', category: 'accessories' },
    ]},
    // Water sports
    { patterns: ['kayak', 'canoe', 'rafting', 'jet ski', 'diving', 'scuba', 'paddleboard', 'water sport'], items: [
      { slug: 'quick_dry', title: 'Quick-dry clothing', category: 'clothing' },
      { slug: 'waterproof_bag', title: 'Waterproof bag or pouch', category: 'accessories' },
    ]},
    // Rain / tropical
    { patterns: ['rainforest', 'monsoon', 'tropical', 'humid', 'rain'], items: [
      { slug: 'rain_jacket', title: 'Lightweight rain jacket', category: 'clothing' },
      { slug: 'umbrella', title: 'Compact umbrella', category: 'accessories' },
    ]},
    // Cultural / temples
    { patterns: ['temple', 'mosque', 'church', 'shrine', 'monastery', 'religious site', 'sacred'], items: [
      { slug: 'modest_clothing', title: 'Modest clothing (covers shoulders/knees)', category: 'clothing', notes: 'May be required at religious sites' },
    ]},
    // Camping
    { patterns: ['camp', 'camping', 'tent', 'glamping', 'outdoors overnight'], items: [
      { slug: 'flashlight', title: 'Flashlight or headlamp', category: 'accessories' },
      { slug: 'insect_repellent', title: 'Insect repellent', category: 'toiletries' },
    ]},
  ]

  for (const rule of KEYWORD_RULES) {
    const hit = rule.patterns.some(p => corpus.includes(p))
    if (hit) {
      for (const item of rule.items) {
        add(item.slug, item.title, item.category, item.notes || null)
      }
    }
  }

  // ── Season inference ──
  if (startDate) {
    try {
      const month = new Date(startDate).getMonth() // 0-indexed
      // Northern hemisphere heuristic (good enough for rule-based fallback)
      if (month >= 5 && month <= 8) {
        // Summer (Jun-Sep)
        add('sunscreen', 'Sunscreen (SPF 30+)', 'toiletries')
        add('sunglasses', 'Sunglasses', 'accessories')
        add('hat_sun', 'Sun hat or cap', 'accessories')
      } else if (month >= 11 || month <= 1) {
        // Winter (Dec-Feb)
        add('warm_jacket', 'Warm jacket / puffer', 'clothing')
        add('layers', 'Layering pieces', 'clothing', 'Consider bringing versatile layers')
      }
    } catch (_) {
      // Invalid date, skip season inference
    }
  }

  // ── Duration-based ──
  const days = durationDays || (itinerary?.days?.length) || 0
  if (days > 5) {
    add('laundry_bag', 'Laundry bag', 'accessories')
    add('extra_undergarments', 'Extra undergarments', 'clothing')
  }

  // ── Multi-location detection ──
  if (itinerary && itinerary.days && Array.isArray(itinerary.days)) {
    const locations = new Set()
    for (const day of itinerary.days) {
      if (day.blocks && Array.isArray(day.blocks)) {
        for (const block of day.blocks) {
          if (block.location) locations.add(block.location.toLowerCase().trim())
        }
      }
    }
    if (locations.size > 2) {
      add('packing_cubes', 'Packing cubes', 'accessories', 'Helpful for multi-stop trips')
      add('travel_toiletries', 'Travel-size toiletries', 'toiletries')
    }
  }

  // ── Baseline items (always suggested) ──
  add('phone_charger', 'Phone charger', 'electronics')
  add('medications', 'Personal medications', 'health', 'Bring enough for the full trip plus a buffer day')
  add('travel_documents', 'Travel documents (ID / passport)', 'documents')
  add('comfortable_shoes', 'Comfortable walking shoes', 'footwear')

  return suggestions
}
