import { createClient } from '@/lib/supabase/server';

const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const USDA_API_KEY = process.env.USDA_API_KEY;

// Cache expiration in days
const CACHE_EXPIRATION_DAYS = 90;

export interface USDAFood {
  fdcId: number;
  description: string;
  score?: number;
}

export interface NutritionalData {
  fdcId: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface CachedIngredient {
  ingredient_name: string;
  fdc_id: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

interface USDANutrient {
  // Flat structure (used by search endpoint's abridged format)
  nutrientName?: string;
  nutrientNumber?: string;
  value?: number;
  // Nested structure (used by food details endpoint)
  nutrient?: {
    id: number;
    name: string;
    number: string;
    rank: number;
    unitName: string;
  };
  amount?: number;
  id?: number;
  dataPoints?: number;
  type?: string;
}

interface USDAFoodSearchResult {
  foods: Array<{
    fdcId: number;
    description: string;
    score?: number;
    foodNutrients?: USDANutrient[];
  }>;
}

interface USDAFoodDetails {
  fdcId: number;
  description: string;
  foodNutrients: USDANutrient[];
}

/**
 * Search for foods in the USDA FoodData Central database
 */
export async function searchFood(query: string): Promise<USDAFood[]> {
  if (!USDA_API_KEY) {
    throw new Error('USDA_API_KEY is not configured');
  }

  const normalizedQuery = normalizeIngredientName(query);
  const url = `${USDA_BASE_URL}/foods/search?query=${encodeURIComponent(normalizedQuery)}&api_key=${USDA_API_KEY}&pageSize=10&dataType=SR Legacy,Foundation`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`USDA API search failed: ${response.statusText}`);
  }

  const data: USDAFoodSearchResult = await response.json();
  return data.foods.map(food => ({
    fdcId: food.fdcId,
    description: food.description,
    score: food.score,
  }));
}

/**
 * Select the best matching food from search results
 * Uses heuristics to avoid common mismatches (e.g., cod liver oil vs cod fish)
 */
function selectBestMatch(query: string, results: USDAFood[]): USDAFood | null {
  if (results.length === 0) return null;

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  // Terms that indicate processed/derivative products we usually don't want
  const excludeTerms = ['oil', 'flour', 'powder', 'extract', 'juice', 'sauce', 'syrup', 'dried', 'canned', 'frozen'];
  // Unless the query specifically asks for them
  const queryHasExcludeTerm = excludeTerms.some(term => queryLower.includes(term));

  // Score each result
  const scored = results.map(food => {
    const descLower = food.description.toLowerCase();
    let score = food.score || 0;

    // Bonus for exact word matches in description
    for (const word of queryWords) {
      if (descLower.includes(word)) {
        score += 50;
      }
    }

    // Bonus for "raw" when query doesn't specify cooking method
    if (descLower.includes('raw') && !queryLower.includes('cooked')) {
      score += 30;
    }

    // Penalty for derivative products unless query asks for them
    if (!queryHasExcludeTerm) {
      for (const term of excludeTerms) {
        if (descLower.includes(term)) {
          score -= 200;
        }
      }
    }

    // Penalty if description has "liver" or "organ" when query doesn't
    if (!queryLower.includes('liver') && descLower.includes('liver')) {
      score -= 300;
    }
    if (!queryLower.includes('organ') && descLower.includes('organ')) {
      score -= 300;
    }

    // Bonus for shorter descriptions (usually more generic/common items)
    score -= food.description.length * 0.5;

    return { food, score };
  });

  // Sort by our custom score
  scored.sort((a, b) => b.score - a.score);

  return scored[0].food;
}

/**
 * Get detailed nutritional data for a specific food by FDC ID
 */
export async function getFoodDetails(fdcId: number): Promise<NutritionalData> {
  if (!USDA_API_KEY) {
    throw new Error('USDA_API_KEY is not configured');
  }

  const url = `${USDA_BASE_URL}/food/${fdcId}?api_key=${USDA_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`USDA API food details failed: ${response.statusText}`);
  }

  const data: USDAFoodDetails = await response.json();
  return extractNutrients(data);
}

/**
 * Extract macronutrients from USDA food details response
 * Handles different USDA API response formats
 */
function extractNutrients(food: USDAFoodDetails): NutritionalData {
  const nutrients = food.foodNutrients || [];

  // USDA nutrient numbers (these are the standard identifiers)
  const NUTRIENT_NUMBERS: Record<string, string[]> = {
    calories: ['208', '1008'], // Energy in kcal
    protein: ['203', '1003'],
    carbs: ['205', '1005'],
    fat: ['204', '1004'],
  };

  // Build a map of nutrient number -> amount for quick lookup
  const nutrientMap = new Map<string, number>();

  for (const n of nutrients) {
    const num = String(n.nutrientNumber || n.nutrient?.number || '');
    const val = n.value ?? n.amount;

    if (num && val !== undefined && val !== null) {
      nutrientMap.set(num, val);
    }
  }

  // Extract each macro by nutrient number
  const findByNumbers = (numbers: string[]): number => {
    for (const num of numbers) {
      const val = nutrientMap.get(num);
      if (val !== undefined) {
        return val;
      }
    }
    return 0;
  };

  const result = {
    fdcId: food.fdcId,
    calories: findByNumbers(NUTRIENT_NUMBERS.calories),
    protein: findByNumbers(NUTRIENT_NUMBERS.protein),
    carbs: findByNumbers(NUTRIENT_NUMBERS.carbs),
    fat: findByNumbers(NUTRIENT_NUMBERS.fat),
  };

  // Debug logging
  console.log(`extractNutrients for fdcId ${food.fdcId}: cal=${result.calories} p=${result.protein} c=${result.carbs} f=${result.fat}`);

  // If carbs is 0, log what nutrients we actually received to debug
  if (result.carbs === 0 && result.calories > 0) {
    console.warn(`WARNING: carbs=0 but calories=${result.calories}. Checking for nutrient 205...`);
    const carbNutrient = nutrients.find(n => {
      const num = String(n.nutrientNumber || n.nutrient?.number || '');
      return num === '205' || num === '1005';
    });
    if (carbNutrient) {
      console.warn(`Found carb nutrient:`, JSON.stringify(carbNutrient));
    } else {
      console.warn(`No carb nutrient (205 or 1005) found in ${nutrients.length} nutrients`);
    }
  }

  return result;
}

/**
 * Normalize ingredient names for better USDA matching
 * Maps common recipe terms to USDA-friendly search terms
 */
function normalizeIngredientName(name: string): string {
  const normalizations: Record<string, string> = {
    // Proteins
    'chicken breast': 'chicken broilers breast meat raw',
    'chicken thigh': 'chicken broilers thigh meat raw',
    'chicken thighs': 'chicken broilers thigh meat raw',
    'ground beef': 'beef ground raw',
    'ground turkey': 'turkey ground raw',
    'salmon': 'salmon atlantic raw',
    'salmon fillet': 'salmon atlantic raw',
    'cod': 'fish cod atlantic raw',
    'cod fillet': 'fish cod atlantic raw',
    'cod filet': 'fish cod atlantic raw',
    'tilapia': 'fish tilapia raw',
    'tilapia fillet': 'fish tilapia raw',
    'tuna': 'fish tuna raw',
    'shrimp': 'crustaceans shrimp raw',
    'tofu': 'tofu raw firm',
    'tempeh': 'tempeh',
    'turkey breast': 'turkey breast meat raw',
    'pork chop': 'pork loin raw',
    'pork tenderloin': 'pork tenderloin raw',
    'steak': 'beef steak raw',
    'beef steak': 'beef steak raw',

    // Grains & Carbs
    'brown rice': 'rice brown long-grain raw',
    'white rice': 'rice white long-grain raw',
    'quinoa': 'quinoa uncooked',
    'pasta': 'pasta dry unenriched',
    'bread': 'bread whole wheat',
    'whole wheat bread': 'bread whole wheat',
    'oats': 'oats regular or quick',
    'rolled oats': 'oats regular or quick',
    'sweet potato': 'sweet potato raw',
    'potato': 'potato raw',
    'potatoes': 'potato raw',

    // Vegetables
    'broccoli': 'broccoli raw',
    'spinach': 'spinach raw',
    'kale': 'kale raw',
    'lettuce': 'lettuce raw',
    'tomato': 'tomato raw',
    'tomatoes': 'tomato raw',
    'onion': 'onion raw',
    'garlic': 'garlic raw',
    'bell pepper': 'peppers sweet raw',
    'carrot': 'carrot raw',
    'carrots': 'carrot raw',
    'zucchini': 'squash zucchini raw',
    'cucumber': 'cucumber raw',
    'asparagus': 'asparagus raw',
    'green beans': 'beans snap green raw',
    'mushrooms': 'mushrooms raw',
    'cauliflower': 'cauliflower raw',

    // Fruits
    'banana': 'banana raw',
    'apple': 'apple raw',
    'orange': 'orange raw',
    'strawberries': 'strawberries raw',
    'blueberries': 'blueberries raw',
    'avocado': 'avocado raw',

    // Dairy & Eggs
    'greek yogurt': 'yogurt greek plain',
    'yogurt': 'yogurt plain',
    'milk': 'milk whole',
    'egg': 'egg whole raw',
    'eggs': 'egg whole raw',
    'cheese': 'cheese cheddar',
    'cottage cheese': 'cottage cheese',

    // Fats & Oils
    'olive oil': 'oil olive salad or cooking',
    'coconut oil': 'oil coconut',
    'butter': 'butter salted',

    // Nuts & Seeds
    'almond butter': 'almond butter plain',
    'peanut butter': 'peanut butter smooth',
    'almonds': 'almonds raw',
    'walnuts': 'walnuts raw',
    'cashews': 'cashews raw',
    'peanuts': 'peanuts raw',
    'chia seeds': 'seeds chia dried',
    'flax seeds': 'seeds flaxseed',

    // Legumes
    'black beans': 'beans black cooked',
    'chickpeas': 'chickpeas cooked',
    'lentils': 'lentils cooked',

    // Misc
    'honey': 'honey',
    'maple syrup': 'maple syrup',
  };

  const lowerName = name.toLowerCase().trim();
  return normalizations[lowerName] || lowerName;
}

/**
 * Get or fetch ingredient nutritional data with database caching
 * This is the main function to use - it handles the cache-first approach
 */
export async function getOrFetchIngredient(name: string): Promise<CachedIngredient | null> {
  const supabase = await createClient();
  const normalizedName = name.toLowerCase().trim();

  // 1. Check if ingredient exists in cache
  const { data: cached, error: cacheError } = await supabase
    .from('usda_ingredients')
    .select('*')
    .eq('ingredient_name', normalizedName)
    .single();

  if (cached && !cacheError) {
    // Check if cache is stale (older than 90 days)
    const updatedAt = new Date(cached.updated_at);
    const now = new Date();
    const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate < CACHE_EXPIRATION_DAYS) {
      const result = {
        ingredient_name: cached.ingredient_name,
        fdc_id: cached.fdc_id,
        calories_per_100g: parseFloat(cached.calories_per_100g),
        protein_per_100g: parseFloat(cached.protein_per_100g),
        carbs_per_100g: parseFloat(cached.carbs_per_100g),
        fat_per_100g: parseFloat(cached.fat_per_100g),
      };

      // Validate cached data - if it looks corrupted, re-fetch
      if (!isCacheDataValid(result)) {
        console.log(`USDA cache invalidated for "${name}" - will re-fetch`);
        // Delete the invalid cache entry
        await supabase
          .from('usda_ingredients')
          .delete()
          .eq('ingredient_name', normalizedName);
        // Fall through to fetch fresh data
      } else {
        console.log(`USDA cache hit for "${name}": cal=${result.calories_per_100g} p=${result.protein_per_100g} c=${result.carbs_per_100g} f=${result.fat_per_100g}`);
        return result;
      }
    }
  }

  // 2. Not in cache or stale - fetch from USDA API
  try {
    const searchResults = await searchFood(normalizedName);
    if (searchResults.length === 0) {
      console.warn(`No USDA results found for: ${name}`);
      return null;
    }

    // Use smart matching to select the best result
    const bestMatch = selectBestMatch(normalizedName, searchResults);
    if (!bestMatch) {
      console.warn(`No suitable USDA match found for: ${name}`);
      return null;
    }
    console.log(`USDA: "${name}" -> "${bestMatch.description}" (fdc:${bestMatch.fdcId})`);
    const nutritionData = await getFoodDetails(bestMatch.fdcId);
    console.log(`USDA API returned: cal=${nutritionData.calories} p=${nutritionData.protein} c=${nutritionData.carbs} f=${nutritionData.fat}`);

    // 3. Store in database cache
    const cacheData = {
      ingredient_name: normalizedName,
      fdc_id: nutritionData.fdcId,
      calories_per_100g: nutritionData.calories,
      protein_per_100g: nutritionData.protein,
      carbs_per_100g: nutritionData.carbs,
      fat_per_100g: nutritionData.fat,
      updated_at: new Date().toISOString(),
    };

    // Upsert to handle both insert and update cases
    const { error: insertError } = await supabase
      .from('usda_ingredients')
      .upsert(cacheData, { onConflict: 'ingredient_name' });

    if (insertError) {
      console.error('Failed to cache USDA ingredient:', insertError);
      console.error('Cache data attempted:', cacheData);
      // Still return the data even if caching fails
    } else {
      console.log(`Cached USDA data for: ${normalizedName}`);
    }

    return {
      ingredient_name: normalizedName,
      fdc_id: nutritionData.fdcId,
      calories_per_100g: nutritionData.calories,
      protein_per_100g: nutritionData.protein,
      carbs_per_100g: nutritionData.carbs,
      fat_per_100g: nutritionData.fat,
    };
  } catch (error) {
    console.error(`Failed to fetch USDA data for ${name}:`, error);
    return null;
  }
}

/**
 * Calculate macros for a specific amount of an ingredient
 * @param ingredientData - Cached ingredient with per-100g values
 * @param amountInGrams - The amount of the ingredient in grams
 */
export function calculateMacrosForAmount(
  ingredientData: CachedIngredient,
  amountInGrams: number
): { calories: number; protein: number; carbs: number; fat: number } {
  const factor = amountInGrams / 100;
  return {
    calories: Math.round(ingredientData.calories_per_100g * factor),
    protein: Math.round(ingredientData.protein_per_100g * factor * 10) / 10,
    carbs: Math.round(ingredientData.carbs_per_100g * factor * 10) / 10,
    fat: Math.round(ingredientData.fat_per_100g * factor * 10) / 10,
  };
}

/**
 * Check if cached data looks valid (sanity check for obviously wrong data)
 * Returns false if the data seems corrupted or incomplete
 */
function isCacheDataValid(cached: CachedIngredient): boolean {
  // If we have significant calories but carbs is exactly 0, it's likely a bug
  // Very few foods with >50 cal/100g have exactly 0 carbs (pure fats/oils are exceptions)
  // Pure fats have ~900 cal/100g and ~100g fat
  const isPureFat = cached.fat_per_100g > 80 && cached.calories_per_100g > 800;

  if (cached.calories_per_100g > 50 && cached.carbs_per_100g === 0 && !isPureFat) {
    console.warn(`Cache validation failed for "${cached.ingredient_name}": calories=${cached.calories_per_100g} but carbs=0 (suspicious)`);
    return false;
  }

  // If we have calories but ALL macros are 0, something is definitely wrong
  if (cached.calories_per_100g > 0 &&
      cached.protein_per_100g === 0 &&
      cached.carbs_per_100g === 0 &&
      cached.fat_per_100g === 0) {
    console.warn(`Cache validation failed for "${cached.ingredient_name}": has calories but all macros are 0`);
    return false;
  }

  // Sanity check: calculated calories should be in reasonable range of stored calories
  // Calories = protein*4 + carbs*4 + fat*9
  const expectedCalories = (cached.protein_per_100g * 4) +
                          (cached.carbs_per_100g * 4) +
                          (cached.fat_per_100g * 9);

  // If expected is very low but actual is high, something is wrong
  if (expectedCalories < 20 && cached.calories_per_100g > 80) {
    console.warn(`Cache validation failed for "${cached.ingredient_name}": calories=${cached.calories_per_100g} but macro-calculated=${expectedCalories}`);
    return false;
  }

  return true;
}

/**
 * Clear all cached USDA ingredients to force fresh fetches
 * Use this after fixing data extraction bugs
 */
export async function clearUsdaCache(): Promise<{ cleared: number; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('usda_ingredients')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows
    .select('id');

  if (error) {
    console.error('Failed to clear USDA cache:', error);
    return { cleared: 0, error: error.message };
  }

  return { cleared: data?.length || 0 };
}

/**
 * Clear cached data for specific ingredients (by name)
 */
export async function clearCachedIngredients(names: string[]): Promise<{ cleared: number; error?: string }> {
  const supabase = await createClient();
  const normalizedNames = names.map(n => n.toLowerCase().trim());

  const { data, error } = await supabase
    .from('usda_ingredients')
    .delete()
    .in('ingredient_name', normalizedNames)
    .select('id');

  if (error) {
    console.error('Failed to clear specific ingredients from cache:', error);
    return { cleared: 0, error: error.message };
  }

  return { cleared: data?.length || 0 };
}
