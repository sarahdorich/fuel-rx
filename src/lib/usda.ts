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
  nutrientName?: string;
  nutrientNumber?: string;
  value?: number;
  amount?: number;
  unitName?: string;
  // Some responses nest the nutrient info
  nutrient?: {
    name: string;
    number: string;
    unitName: string;
  };
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
  const url = `${USDA_BASE_URL}/foods/search?query=${encodeURIComponent(normalizedQuery)}&api_key=${USDA_API_KEY}&pageSize=5&dataType=SR Legacy,Foundation`;

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

  // USDA nutrient names to look for
  const calorieNames = ['energy', 'energy (atwater general factors)'];
  const proteinNames = ['protein'];
  const carbNames = ['carbohydrate, by difference', 'carbohydrates'];
  const fatNames = ['total lipid (fat)', 'total fat'];

  // USDA nutrient numbers as fallback (more reliable)
  const NUTRIENT_NUMBERS = {
    calories: ['208', '957'], // Energy in kcal
    protein: ['203'],
    carbs: ['205'],
    fat: ['204'],
  };

  const findNutrient = (names: string[], numbers: string[]): number => {
    for (const n of nutrients) {
      // Get the nutrient name - handle both flat and nested structures
      const nutrientName = n.nutrientName || n.nutrient?.name || '';
      const nutrientNumber = n.nutrientNumber || n.nutrient?.number || '';
      const nutrientValue = n.value ?? n.amount ?? 0;

      // Try matching by number first (more reliable)
      if (numbers.includes(nutrientNumber)) {
        return nutrientValue;
      }

      // Fall back to name matching
      if (nutrientName && names.includes(nutrientName.toLowerCase())) {
        return nutrientValue;
      }
    }
    return 0;
  };

  return {
    fdcId: food.fdcId,
    calories: findNutrient(calorieNames, NUTRIENT_NUMBERS.calories),
    protein: findNutrient(proteinNames, NUTRIENT_NUMBERS.protein),
    carbs: findNutrient(carbNames, NUTRIENT_NUMBERS.carbs),
    fat: findNutrient(fatNames, NUTRIENT_NUMBERS.fat),
  };
}

/**
 * Normalize ingredient names for better USDA matching
 * Maps common recipe terms to USDA-friendly search terms
 */
function normalizeIngredientName(name: string): string {
  const normalizations: Record<string, string> = {
    'chicken breast': 'chicken broilers breast meat raw',
    'ground beef': 'beef ground raw',
    'ground turkey': 'turkey ground raw',
    'salmon': 'salmon atlantic raw',
    'salmon fillet': 'salmon atlantic raw',
    'brown rice': 'rice brown long-grain raw',
    'white rice': 'rice white long-grain raw',
    'sweet potato': 'sweet potato raw',
    'broccoli': 'broccoli raw',
    'spinach': 'spinach raw',
    'olive oil': 'oil olive salad or cooking',
    'coconut oil': 'oil coconut',
    'greek yogurt': 'yogurt greek plain',
    'egg': 'egg whole raw',
    'eggs': 'egg whole raw',
    'oats': 'oats regular or quick',
    'rolled oats': 'oats regular or quick',
    'almond butter': 'almond butter plain',
    'peanut butter': 'peanut butter smooth',
    'banana': 'banana raw',
    'apple': 'apple raw',
    'avocado': 'avocado raw',
    'almonds': 'almonds raw',
    'walnuts': 'walnuts raw',
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
      return {
        ingredient_name: cached.ingredient_name,
        fdc_id: cached.fdc_id,
        calories_per_100g: parseFloat(cached.calories_per_100g),
        protein_per_100g: parseFloat(cached.protein_per_100g),
        carbs_per_100g: parseFloat(cached.carbs_per_100g),
        fat_per_100g: parseFloat(cached.fat_per_100g),
      };
    }
  }

  // 2. Not in cache or stale - fetch from USDA API
  try {
    const searchResults = await searchFood(normalizedName);
    if (searchResults.length === 0) {
      console.warn(`No USDA results found for: ${name}`);
      return null;
    }

    // Use the best match (first result)
    const bestMatch = searchResults[0];
    const nutritionData = await getFoodDetails(bestMatch.fdcId);

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
