import Anthropic from '@anthropic-ai/sdk';
import type {
  UserProfile,
  DayPlan,
  Ingredient,
  IngredientWithNutrition,
  MealConsistencyPrefs,
  MealType,
  Meal,
  MealWithIngredientNutrition,
  Macros,
  CoreIngredients,
  IngredientVarietyPrefs,
  PrepItem,
  DailyAssembly,
  PrepModeResponse,
  DayOfWeek,
  IngredientNutritionWithDetails,
  PrepStyle,
  MealComplexity,
  PrepSessionType,
  HouseholdServingsPrefs,
} from './types';
import { DEFAULT_MEAL_CONSISTENCY_PREFS, DEFAULT_INGREDIENT_VARIETY_PREFS, MEAL_COMPLEXITY_LABELS, DEFAULT_HOUSEHOLD_SERVINGS_PREFS, DAYS_OF_WEEK, CHILD_PORTION_MULTIPLIER, DAY_OF_WEEK_LABELS } from './types';
import { createClient } from './supabase/server';

// ============================================
// Ingredient Nutrition Cache Functions
// ============================================

/**
 * Fetch cached nutrition data for ingredients
 * Returns a map of normalized ingredient names to nutrition data
 * Uses the ingredient_nutrition_with_details view for convenience
 */
async function fetchCachedNutrition(ingredientNames: string[]): Promise<Map<string, IngredientNutritionWithDetails>> {
  const supabase = await createClient();
  const normalizedNames = ingredientNames.map(name => name.toLowerCase().trim());

  const { data, error } = await supabase
    .from('ingredient_nutrition_with_details')
    .select('*')
    .in('name_normalized', normalizedNames);

  if (error) {
    console.error('Error fetching cached nutrition:', error);
    return new Map();
  }

  const nutritionMap = new Map<string, IngredientNutritionWithDetails>();
  for (const item of data || []) {
    nutritionMap.set(item.name_normalized, item as IngredientNutritionWithDetails);
  }

  return nutritionMap;
}

/**
 * Get or create an ingredient in the ingredients dimension table
 * Returns the ingredient ID
 */
async function getOrCreateIngredient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  category: string = 'other'
): Promise<string | null> {
  const normalizedName = name.toLowerCase().trim();

  // Try to find existing ingredient
  const { data: existing } = await supabase
    .from('ingredients')
    .select('id')
    .eq('name_normalized', normalizedName)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new ingredient
  const { data: created, error } = await supabase
    .from('ingredients')
    .insert({
      name,
      name_normalized: normalizedName,
      category,
    })
    .select('id')
    .single();

  if (error) {
    // Handle race condition - another request might have created it
    if (error.code === '23505') { // unique_violation
      const { data: retry } = await supabase
        .from('ingredients')
        .select('id')
        .eq('name_normalized', normalizedName)
        .single();
      return retry?.id || null;
    }
    console.error('Error creating ingredient:', error);
    return null;
  }

  return created?.id || null;
}

/**
 * Cache new nutrition data for ingredients
 * First ensures the ingredient exists in the ingredients table,
 * then adds the nutrition data for the specific serving size
 */
async function cacheIngredientNutrition(
  ingredients: Array<{
    name: string;
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    category?: string;
  }>
): Promise<void> {
  const supabase = await createClient();

  for (const ing of ingredients) {
    // Get or create the ingredient
    const ingredientId = await getOrCreateIngredient(supabase, ing.name, ing.category || 'other');

    if (!ingredientId) {
      console.error(`Failed to get/create ingredient: ${ing.name}`);
      continue;
    }

    // Insert nutrition data for this serving size
    // Round to integers since the database expects integer values
    const { error } = await supabase
      .from('ingredient_nutrition')
      .upsert({
        ingredient_id: ingredientId,
        serving_size: Math.round(ing.serving_size),
        serving_unit: ing.serving_unit,
        calories: Math.round(ing.calories),
        protein: Math.round(ing.protein),
        carbs: Math.round(ing.carbs),
        fat: Math.round(ing.fat),
        source: 'llm_estimated' as const,
        confidence_score: 0.7,
      }, {
        onConflict: 'ingredient_id,serving_size,serving_unit',
        ignoreDuplicates: true,
      });

    if (error) {
      console.error(`Error caching nutrition for ${ing.name}:`, error);
    }
  }
}

/**
 * Build a nutrition reference string from cached data for LLM prompts
 */
function buildNutritionReferenceSection(nutritionCache: Map<string, IngredientNutritionWithDetails>): string {
  if (nutritionCache.size === 0) return '';

  const lines = Array.from(nutritionCache.values()).map(n =>
    `- ${n.ingredient_name}: ${n.calories} cal, ${n.protein}g protein, ${n.carbs}g carbs, ${n.fat}g fat per ${n.serving_size} ${n.serving_unit}`
  );

  return `
## NUTRITION REFERENCE (use these exact values)
The following ingredients have validated nutrition data. Use these exact values when calculating macros:
${lines.join('\n')}
`;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// JSON Parsing Helper
// ============================================

/**
 * Repair common LLM JSON malformations
 * - Fixes cooking_times being generated as array instead of object
 * - Fixes other fields that should be objects but are arrays
 */
function repairMalformedJSON(jsonText: string): string {
  // Fix cooking_times array -> object pattern
  // The LLM sometimes generates: "cooking_times": [ "prep_time": "5 min", ... ]
  // instead of: "cooking_times": { "prep_time": "5 min", ... }
  let repaired = jsonText;

  // Pattern: "cooking_times": [ ... ] where contents look like object properties
  // Match: "cooking_times": followed by [ then key-value pairs then ]
  const cookingTimesArrayPattern = /"cooking_times"\s*:\s*\[\s*("(?:prep_time|cook_time|rest_time|total_time)")/g;
  if (cookingTimesArrayPattern.test(repaired)) {
    // Replace opening [ with {
    repaired = repaired.replace(/"cooking_times"\s*:\s*\[(\s*"(?:prep_time|cook_time|rest_time|total_time)")/g,
      '"cooking_times": {$1');

    // Find and replace the corresponding closing ] with }
    // This is tricky - we need to find the ] that closes the cooking_times array
    // Look for pattern like "total_time": "X min" followed by ] and replace ] with }
    repaired = repaired.replace(/("(?:prep_time|cook_time|rest_time|total_time)"\s*:\s*"[^"]*")\s*\]/g,
      (_, lastProp) => {
        // Check if this is likely the end of cooking_times by looking at what follows
        return lastProp + ' }';
      });
  }

  // Also fix cooking_temps if it has the same issue
  const cookingTempsArrayPattern = /"cooking_temps"\s*:\s*\[\s*("(?:oven|stovetop|internal_temp|grill)")/g;
  if (cookingTempsArrayPattern.test(repaired)) {
    repaired = repaired.replace(/"cooking_temps"\s*:\s*\[(\s*"(?:oven|stovetop|internal_temp|grill)")/g,
      '"cooking_temps": {$1');
    repaired = repaired.replace(/("(?:oven|stovetop|internal_temp|grill)"\s*:\s*"[^"]*")\s*\]/g,
      (_, lastProp) => lastProp + ' }');
  }

  return repaired;
}

/**
 * Safely extract and parse JSON from LLM response
 * Handles markdown code blocks and extra text before/after JSON
 */
function extractAndParseJSON<T>(responseText: string, context: string): T {
  let jsonText = responseText.trim();

  // Remove markdown code blocks if present
  jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

  // Extract JSON object - find the first { and last }
  const firstBrace = jsonText.indexOf('{');
  const lastBrace = jsonText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonText = jsonText.substring(firstBrace, lastBrace + 1);
  }

  // Try parsing first without repair
  try {
    return JSON.parse(jsonText) as T;
  } catch (firstError) {
    // Try to repair common LLM JSON malformations
    console.log(`Initial parse failed for ${context}, attempting repair...`);
    const repairedJson = repairMalformedJSON(jsonText);

    try {
      const result = JSON.parse(repairedJson) as T;
      console.log(`JSON repair successful for ${context}`);
      return result;
    } catch (repairError) {
      // Both attempts failed, log details and throw
      console.error(`Failed to parse ${context} JSON. Response length:`, responseText.length);
      console.error('First 500 chars:', jsonText.substring(0, 500));
      console.error('Last 200 chars:', jsonText.substring(jsonText.length - 200));

      // Try to find the problematic area around the error position
      if (firstError instanceof SyntaxError) {
        const match = firstError.message.match(/position (\d+)/);
        if (match) {
          const pos = parseInt(match[1], 10);
          console.error(`JSON around error position ${pos}:`, jsonText.substring(Math.max(0, pos - 100), pos + 100));
        }
      }

      console.error('Parse error:', firstError);
      throw firstError;
    }
  }
}

// ============================================
// Household Servings Helper Functions
// ============================================

/**
 * Check if user has any household members configured
 */
function hasHouseholdMembers(servings: HouseholdServingsPrefs): boolean {
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
  return DAYS_OF_WEEK.some(day =>
    mealTypes.some(meal => servings[day]?.[meal]?.adults > 0 || servings[day]?.[meal]?.children > 0)
  );
}

/**
 * Calculate the serving multiplier for a specific day and meal
 * Returns the total multiplier (1 for the athlete + additional household members)
 */
function getServingMultiplier(
  servings: HouseholdServingsPrefs,
  day: DayOfWeek,
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snacks'
): number {
  const dayServings = servings[day]?.[mealType];
  if (!dayServings) return 1;

  // Athlete counts as 1, additional adults as 1 each, children as 0.6 each
  return 1 + dayServings.adults + (dayServings.children * CHILD_PORTION_MULTIPLIER);
}

/**
 * Build a summary of household servings for LLM prompts
 */
function buildHouseholdContextSection(servings: HouseholdServingsPrefs): string {
  if (!hasHouseholdMembers(servings)) {
    return '';
  }

  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
  const lines: string[] = [];

  // Build a day-by-day summary
  for (const day of DAYS_OF_WEEK) {
    const dayServings = servings[day];
    const mealSummaries: string[] = [];

    for (const meal of mealTypes) {
      const serving = dayServings?.[meal];
      if (serving && (serving.adults > 0 || serving.children > 0)) {
        const parts: string[] = [];
        if (serving.adults > 0) parts.push(`${serving.adults} additional adult${serving.adults > 1 ? 's' : ''}`);
        if (serving.children > 0) parts.push(`${serving.children} child${serving.children > 1 ? 'ren' : ''}`);
        const multiplier = getServingMultiplier(servings, day, meal);
        mealSummaries.push(`${meal}: ${parts.join(' + ')} (${multiplier.toFixed(1)}x portions)`);
      }
    }

    if (mealSummaries.length > 0) {
      lines.push(`- ${DAY_OF_WEEK_LABELS[day]}: ${mealSummaries.join(', ')}`);
    }
  }

  if (lines.length === 0) return '';

  return `
## HOUSEHOLD SERVINGS (IMPORTANT)
The athlete is also cooking for their household.

**Household schedule:**
${lines.join('\n')}

**Key guidelines:**
- The athlete's personal macro targets are still the priority for meal COMPOSITION
- Ingredient amounts in meals should be for the ATHLETE ONLY (grocery scaling is handled separately)
- Children count as approximately 0.6x an adult portion
- Choose meals that scale well and are broadly appealing when feeding children
`;
}

/**
 * Calculate the average serving multiplier across all meals for grocery scaling
 */
function getAverageServingMultiplier(servings: HouseholdServingsPrefs): number {
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
  let totalMultiplier = 0;
  let count = 0;

  for (const day of DAYS_OF_WEEK) {
    for (const meal of mealTypes) {
      totalMultiplier += getServingMultiplier(servings, day, meal);
      count++;
    }
  }

  return count > 0 ? totalMultiplier / count : 1;
}

const DIETARY_LABELS: Record<string, string> = {
  no_restrictions: 'No Restrictions',
  paleo: 'Paleo',
  vegetarian: 'Vegetarian',
  gluten_free: 'Gluten-Free',
  dairy_free: 'Dairy-Free',
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

interface ValidatedMealMacros {
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface LLMLogEntry {
  user_id: string;
  prompt: string;
  output: string;
  model: string;
  prompt_type: string;
  tokens_used?: number;
  duration_ms?: number;
}

async function logLLMCall(entry: LLMLogEntry): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from('llm_logs').insert(entry);
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error('Failed to log LLM call:', error);
  }
}

function buildBasePromptContext(
  profile: UserProfile,
  recentMealNames?: string[],
  mealPreferences?: { liked: string[]; disliked: string[] },
  validatedMeals?: ValidatedMealMacros[]
): string {
  const dietaryPrefs = profile.dietary_prefs ?? ['no_restrictions'];
  const dietaryPrefsText = dietaryPrefs
    .map(pref => DIETARY_LABELS[pref] || pref)
    .join(', ') || 'No restrictions';

  // Build comprehensive variety section with recent meals from the last 3 weeks
  let varietySection = '';
  if (recentMealNames && recentMealNames.length > 0) {
    varietySection = `
## CRITICAL: Meal Variety Requirements (from user's last 3 meal plans)

### Meals to AVOID
The following meals have been used recently. You MUST NOT use these exact meal names OR meals with similar flavor profiles/ingredient combinations:
${recentMealNames.slice(0, 50).join(', ')}

### Variety Guidelines
To ensure fresh, exciting meals each week:
1. **Avoid similar flavor profiles** - If recent meals were teriyaki-based, don't use other Asian sweet-savory sauces. If they featured Italian herbs, explore different seasonings.
2. **Avoid similar ingredient combinations** - If recent meals paired chicken with broccoli, use different protein-vegetable pairings.
3. **Change up cooking methods** - If recent meals were mostly baked/roasted, incorporate more stovetop, one-pan, or bowl-style assembly meals.
4. **Explore cuisine diversity** - Rotate through different cuisines:
   - Mediterranean (olive oil, lemon, herbs, feta, olives)
   - Asian (soy, ginger, sesame, rice vinegar, miso)
   - Mexican/Latin (cumin, lime, cilantro, peppers, beans)
   - American/Classic (simple seasonings, familiar comfort foods)
   - Middle Eastern (tahini, za'atar, sumac, chickpeas)
   - Indian-inspired (turmeric, cumin, coriander, yogurt-based)
5. **Vary vegetable preparations** - Mix raw (salads, slaws), steamed, roasted, sautéed, and grilled preparations.
`;
  }

  // Build enhanced meal preferences section
  let mealPreferencesSection = '';
  if (mealPreferences) {
    const hasLikes = mealPreferences.liked.length > 0;
    const hasDislikes = mealPreferences.disliked.length > 0;

    if (hasLikes || hasDislikes) {
      mealPreferencesSection = `
## User Meal Preferences (IMPORTANT - Follow These Closely)
`;
      if (hasLikes) {
        mealPreferencesSection += `
### Meals the User LIKES
The user enjoys these meals. Use them as inspiration for flavor profiles, ingredient combinations, and meal styles they prefer:
${mealPreferences.liked.map(m => `- ${m}`).join('\n')}

**How to use this**: Create meals with SIMILAR flavor profiles, cuisines, or ingredient styles. You can include some of these exact meals if they haven't been used in the last 3 weeks.
`;
      }
      if (hasDislikes) {
        mealPreferencesSection += `
### Meals the User DISLIKES (MUST AVOID)
The user has explicitly disliked these meals. NEVER include them or meals with similar characteristics:
${mealPreferences.disliked.map(m => `- ${m}`).join('\n')}

**STRICT REQUIREMENT**: Do NOT generate these meals or meals with similar:
- Main ingredients or protein sources
- Flavor profiles or seasonings
- Cooking styles or preparations
- Cuisine types (if the pattern suggests they dislike a cuisine)
`;
      }
    }
  }

  let validatedMealsSection = '';
  if (validatedMeals && validatedMeals.length > 0) {
    const mealsList = validatedMeals.map(m =>
      `- "${m.meal_name}": ${m.calories} kcal, ${m.protein}g protein, ${m.carbs}g carbs, ${m.fat}g fat`
    ).join('\n');
    validatedMealsSection = `
## User-Validated Meal Nutrition Data
The user has corrected the nutrition data for the following meals. When generating these meals or similar meals, use these EXACT macro values as a reference:
${mealsList}
`;
  }

  return `You are a nutrition expert specializing in meal planning for CrossFit athletes.
${varietySection}${mealPreferencesSection}${validatedMealsSection}
## User Profile
- Daily Calorie Target: ${profile.target_calories} kcal
- Daily Protein Target: ${profile.target_protein}g
- Daily Carbohydrate Target: ${profile.target_carbs}g
- Daily Fat Target: ${profile.target_fat}g
- Dietary Preferences: ${dietaryPrefsText}
- Meals Per Day: ${profile.meals_per_day}
- Maximum Prep Time Per Meal: ${profile.prep_time} minutes
${profile.weight ? `- Weight: ${profile.weight} lbs` : ''}

## CRITICAL Requirements
1. **ONLY recommend healthy, whole foods that are non-processed or minimally processed**
2. NO ultra-processed foods, artificial ingredients, or packaged convenience foods
3. Focus on: lean proteins, vegetables, fruits, whole grains, legumes, nuts, seeds, and healthy fats
4. Recipes must be practical and achievable within the specified prep time

## CRITICAL NUTRITION ACCURACY REQUIREMENTS
- Use USDA nutritional database values as your reference for all calculations
- Use standard serving sizes and be specific about measurements (e.g., "4 oz chicken breast" not "1 chicken breast")
- When calculating macros, double-check that each meal's macros add up correctly using these standards:
  - Protein: 4 calories per gram
  - Carbohydrates: 4 calories per gram
  - Fat: 9 calories per gram
- Verify that calories = (protein × 4) + (carbs × 4) + (fat × 9) for each meal
- IMPORTANT: Prioritize realistic, accurate nutrition data over hitting exact targets. Do NOT fabricate or round numbers to artificially match targets.`;
}

interface MealTypeResult {
  meals: Meal[];
}

async function generateMealsForType(
  profile: UserProfile,
  mealType: MealType,
  isConsistent: boolean,
  baseContext: string,
  userId: string
): Promise<Meal[]> {
  const mealTypeLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const numMeals = isConsistent ? 1 : 7;

  // Calculate target macros per meal based on meals per day
  const targetCaloriesPerMeal = Math.round(profile.target_calories / profile.meals_per_day);
  const targetProteinPerMeal = Math.round(profile.target_protein / profile.meals_per_day);
  const targetCarbsPerMeal = Math.round(profile.target_carbs / profile.meals_per_day);
  const targetFatPerMeal = Math.round(profile.target_fat / profile.meals_per_day);

  const prompt = `${baseContext}

## Task
Generate ${numMeals} ${mealTypeLabel.toLowerCase()} meal${numMeals > 1 ? 's' : ''} for a 7-day meal plan.
${isConsistent
  ? `This is a CONSISTENT meal - generate ONE meal that will be eaten every day for 7 days.`
  : `These are VARIED meals - generate 7 DIFFERENT ${mealTypeLabel.toLowerCase()} meals, one for each day (Monday through Sunday). Each meal should be unique.`}

Target macros per ${mealTypeLabel.toLowerCase()} (approximately):
- Calories: ~${targetCaloriesPerMeal} kcal
- Protein: ~${targetProteinPerMeal}g
- Carbs: ~${targetCarbsPerMeal}g
- Fat: ~${targetFatPerMeal}g

## Response Format
Return ONLY valid JSON with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "meals": [
    {
      "name": "Meal name",
      "type": "${mealType}",
      "prep_time_minutes": 15,
      "ingredients": [
        {
          "name": "ingredient name",
          "amount": "2",
          "unit": "cups",
          "category": "produce|protein|dairy|grains|pantry|frozen|other"
        }
      ],
      "instructions": ["Step 1", "Step 2"],
      "macros": {
        "calories": 500,
        "protein": 35,
        "carbs": 45,
        "fat": 20
      }
    }
  ]
}

${isConsistent
  ? 'Generate exactly 1 meal in the "meals" array.'
  : 'Generate exactly 7 different meals in the "meals" array, in order for Monday through Sunday.'}`;

  const startTime = Date.now();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });
  const duration = Date.now() - startTime;

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Log the LLM call
  await logLLMCall({
    user_id: userId,
    prompt,
    output: responseText,
    model: 'claude-sonnet-4-20250514',
    prompt_type: `meal_type_batch_${mealType}`,
    tokens_used: message.usage?.output_tokens,
    duration_ms: duration,
  });

  // Check for truncation
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Response was truncated for ${mealType} meals. This should not happen with batched approach.`);
  }

  // Parse the JSON response
  const parsed = extractAndParseJSON<MealTypeResult>(responseText, `${mealType} meals`);
  return parsed.meals;
}

function getMealTypesForPlan(mealsPerDay: number): MealType[] {
  switch (mealsPerDay) {
    case 3:
      return ['breakfast', 'lunch', 'dinner'];
    case 4:
      return ['breakfast', 'lunch', 'dinner', 'snack'];
    case 5:
      return ['breakfast', 'snack', 'lunch', 'snack', 'dinner'];
    case 6:
      return ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack'];
    default:
      return ['breakfast', 'lunch', 'dinner'];
  }
}

function collectRawIngredients(days: DayPlan[]): Ingredient[] {
  // Collect all ingredients without consolidation for LLM processing
  const allIngredients: Ingredient[] = [];

  for (const day of days) {
    for (const meal of day.meals) {
      for (const ingredient of meal.ingredients) {
        allIngredients.push({ ...ingredient });
      }
    }
  }

  return allIngredients;
}

async function consolidateGroceryListWithLLM(
  rawIngredients: Ingredient[],
  userId: string
): Promise<Ingredient[]> {
  // Group raw ingredients by name similarity for the prompt
  const ingredientSummary = rawIngredients.map(i =>
    `${i.amount} ${i.unit} ${i.name} (${i.category})`
  ).join('\n');

  const prompt = `You are a helpful assistant that creates practical grocery shopping lists.

## Task
Take this raw list of ingredients from a 7-day meal plan and consolidate them into a practical grocery shopping list.

## Raw Ingredients (one per line):
${ingredientSummary}

## Instructions
1. **Combine similar ingredients**: Merge items that are the same ingredient even if described differently (e.g., "avocado", "avocado, sliced", "1/2 avocado" should all become one "Avocados" entry)
2. **Use practical shopping quantities**: Convert to units you'd actually buy at a store:
   - Use "whole" or count for items bought individually (e.g., "3 Avocados" not "2.5 medium avocado")
   - Use "bag" for items typically sold in bags (e.g., "1 bag Carrots" or "2 bags Spinach")
   - Use "bunch" for herbs and leafy greens sold in bunches
   - Use "lb" or "oz" for meats and proteins
   - Use "can" or "jar" for canned/jarred items
   - Use "dozen" for eggs
   - Use "container" or "package" for items sold that way (e.g., yogurt, tofu)
3. **Round up to whole numbers**: Always round up to ensure the shopper has enough (e.g., 1.3 avocados → 2 avocados)
4. **Keep practical minimums**: Don't list less than you can buy (e.g., at least 1 bag of carrots, at least 1 bunch of cilantro)
5. **Preserve categories**: Keep the same category for each ingredient

## Response Format
Return ONLY valid JSON with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "grocery_list": [
    {
      "name": "Ingredient name (capitalized, simple)",
      "amount": "2",
      "unit": "whole",
      "category": "produce|protein|dairy|grains|pantry|frozen|other"
    }
  ]
}

Sort the list by category (produce, protein, dairy, grains, pantry, frozen, other) then alphabetically by name within each category.`;

  const startTime = Date.now();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });
  const duration = Date.now() - startTime;

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Log the LLM call
  await logLLMCall({
    user_id: userId,
    prompt,
    output: responseText,
    model: 'claude-sonnet-4-20250514',
    prompt_type: 'grocery_list_consolidation',
    tokens_used: message.usage?.output_tokens,
    duration_ms: duration,
  });

  // Parse the JSON response
  const parsed = extractAndParseJSON<{ grocery_list: Ingredient[] }>(responseText, 'grocery list consolidation');
  return parsed.grocery_list;
}

export async function generateMealPlan(
  profile: UserProfile,
  userId: string,
  recentMealNames?: string[],
  mealPreferences?: { liked: string[]; disliked: string[] },
  validatedMeals?: ValidatedMealMacros[]
): Promise<{
  days: DayPlan[];
  grocery_list: Ingredient[];
}> {
  const mealConsistencyPrefs = profile.meal_consistency_prefs ?? DEFAULT_MEAL_CONSISTENCY_PREFS;
  const baseContext = buildBasePromptContext(profile, recentMealNames, mealPreferences, validatedMeals);

  // Determine which meal types we need based on meals per day
  const mealTypesNeeded = getMealTypesForPlan(profile.meals_per_day);
  const uniqueMealTypes = Array.from(new Set(mealTypesNeeded)) as MealType[];

  // Generate meals for each type in parallel
  const mealTypePromises = uniqueMealTypes.map(mealType => {
    const isConsistent = mealConsistencyPrefs[mealType] === 'consistent';
    return generateMealsForType(profile, mealType, isConsistent, baseContext, userId)
      .then(meals => ({ mealType, meals, isConsistent }));
  });

  const mealTypeResults = await Promise.all(mealTypePromises);

  // Build a map of meal type to meals
  const mealsByType = new Map<MealType, { meals: Meal[]; isConsistent: boolean }>();
  for (const result of mealTypeResults) {
    mealsByType.set(result.mealType, { meals: result.meals, isConsistent: result.isConsistent });
  }

  // Assemble the 7-day plan
  const days: DayPlan[] = DAYS.map((day, dayIndex) => {
    const mealsForDay: Meal[] = [];

    // Track snack index for days with multiple snacks
    let snackIndex = 0;

    for (const mealType of mealTypesNeeded) {
      const typeData = mealsByType.get(mealType);
      if (!typeData) continue;

      let meal: Meal;
      if (typeData.isConsistent) {
        // Use the same meal for all days
        meal = { ...typeData.meals[0] };
      } else {
        // Use the day-specific meal
        if (mealType === 'snack') {
          // Handle multiple snacks per day - use different snacks if available
          const snackMealIndex = (dayIndex + snackIndex) % typeData.meals.length;
          meal = { ...typeData.meals[snackMealIndex] };
          snackIndex++;
        } else {
          meal = { ...typeData.meals[dayIndex] };
        }
      }

      mealsForDay.push(meal);
    }

    // Calculate daily totals
    const daily_totals: Macros = mealsForDay.reduce(
      (totals, meal) => ({
        calories: totals.calories + meal.macros.calories,
        protein: totals.protein + meal.macros.protein,
        carbs: totals.carbs + meal.macros.carbs,
        fat: totals.fat + meal.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return {
      day,
      meals: mealsForDay,
      daily_totals,
    };
  });

  // Collect raw ingredients and consolidate with LLM for practical shopping list
  const rawIngredients = collectRawIngredients(days);
  const grocery_list = await consolidateGroceryListWithLLM(rawIngredients, userId);

  return { days, grocery_list };
}

// ============================================
// Two-Stage Meal Generation
// ============================================

/**
 * Stage 1: Generate core ingredients for the week with quantity estimates
 * Selects a focused set of ingredients and estimates quantities to meet weekly calorie targets
 */
async function generateCoreIngredients(
  profile: UserProfile,
  userId: string,
  recentMealNames?: string[],
  mealPreferences?: { liked: string[]; disliked: string[] },
  ingredientPreferences?: { liked: string[]; disliked: string[] }
): Promise<CoreIngredients> {
  const dietaryPrefs = profile.dietary_prefs ?? ['no_restrictions'];
  const dietaryPrefsText = dietaryPrefs
    .map(pref => DIETARY_LABELS[pref] || pref)
    .join(', ') || 'No restrictions';

  const varietyPrefs = profile.ingredient_variety_prefs ?? DEFAULT_INGREDIENT_VARIETY_PREFS;

  // Calculate weekly macro targets
  const weeklyCalories = profile.target_calories * 7;
  const weeklyProtein = profile.target_protein * 7;
  const weeklyCarbs = profile.target_carbs * 7;
  const weeklyFat = profile.target_fat * 7;

  // Map prep_time to complexity level
  let prepComplexity = 'moderate';
  if (profile.prep_time <= 15) prepComplexity = 'minimal';
  else if (profile.prep_time >= 45) prepComplexity = 'extensive';

  // Build variety section for ingredient selection based on last 3 meal plans
  let exclusionsSection = '';
  if (recentMealNames && recentMealNames.length > 0) {
    exclusionsSection = `
## CRITICAL: Ingredient Variety for Fresh Meals (based on user's last 3 meal plans)

### Recent Meals to Avoid Recreating
${recentMealNames.slice(0, 30).join(', ')}

### Variety Strategy for Ingredient Selection
To create DIFFERENT meals from recent weeks, select ingredients that enable:

1. **Different cuisines** - If recent meals were mostly Mediterranean, choose ingredients for Asian, Mexican, or American-style dishes
2. **Different protein preparations** - If chicken was always baked, pick proteins that work well for stir-frying, grilling, or bowl assembly
3. **Different flavor bases** - Rotate between:
   - Citrus-forward (lemon, lime)
   - Asian aromatics (ginger, soy, sesame)
   - Mediterranean herbs (oregano, basil, garlic)
   - Latin spices (cumin, cilantro, chili)
4. **Different vegetable families** - Mix cruciferous (broccoli, cauliflower), leafy greens, nightshades (peppers, tomatoes), and root vegetables
`;
  }

  // Build enhanced preferences section for ingredient selection
  let preferencesSection = '';
  if (mealPreferences) {
    const hasLikes = mealPreferences.liked.length > 0;
    const hasDislikes = mealPreferences.disliked.length > 0;

    if (hasLikes || hasDislikes) {
      preferencesSection = '\n## User Meal Preferences (Use to Guide Ingredient Selection)\n';
      if (hasLikes) {
        preferencesSection += `
**Meals the user LIKES**: ${mealPreferences.liked.join(', ')}
- Choose ingredients that enable similar flavor profiles and meal styles
- These meals indicate the user's preferred cuisines and cooking methods
`;
      }
      if (hasDislikes) {
        preferencesSection += `
**Meals the user DISLIKES**: ${mealPreferences.disliked.join(', ')}
- AVOID ingredients strongly associated with these disliked meals
- Do NOT select proteins, seasonings, or combinations that would lead to similar meals
- If the user dislikes several meals from a cuisine, avoid ingredients specific to that cuisine
`;
      }
    }
  }

  // Build ingredient preferences section
  let ingredientPreferencesSection = '';
  if (ingredientPreferences) {
    const hasLikedIngredients = ingredientPreferences.liked.length > 0;
    const hasDislikedIngredients = ingredientPreferences.disliked.length > 0;

    if (hasLikedIngredients || hasDislikedIngredients) {
      ingredientPreferencesSection = '\n## User Ingredient Preferences (CRITICAL - MUST FOLLOW)\n';
      if (hasLikedIngredients) {
        ingredientPreferencesSection += `
**Ingredients the user LIKES** (prioritize including these):
${ingredientPreferences.liked.map(i => `- ${i}`).join('\n')}
`;
      }
      if (hasDislikedIngredients) {
        ingredientPreferencesSection += `
**Ingredients the user DISLIKES** (NEVER include these):
${ingredientPreferences.disliked.map(i => `- ${i}`).join('\n')}

⚠️ STRICT RULE: Do NOT include any disliked ingredients in your selection. The user has explicitly marked these as ingredients they do not want.
`;
      }
    }
  }

  // Fetch cached nutrition data for common ingredients to provide as reference
  const commonIngredients = [
    'chicken breast', 'ground beef', 'salmon', 'eggs', 'greek yogurt',
    'broccoli', 'spinach', 'sweet potato', 'bell peppers', 'rice',
    'quinoa', 'oats', 'avocado', 'olive oil', 'almonds', 'banana'
  ];
  const nutritionCache = await fetchCachedNutrition(commonIngredients);
  const nutritionReference = buildNutritionReferenceSection(nutritionCache);

  const prompt = `You are a meal planning assistant for CrossFit athletes. Your job is to select a focused set of core ingredients for one week of meals that will MEET THE USER'S CALORIE AND MACRO TARGETS.
${exclusionsSection}${preferencesSection}${ingredientPreferencesSection}
## CRITICAL: WEEKLY CALORIE TARGET
The user needs approximately ${weeklyCalories} calories for the week (${profile.target_calories} per day).
- Weekly Protein Target: ${weeklyProtein}g (${profile.target_protein}g/day)
- Weekly Carbs Target: ${weeklyCarbs}g (${profile.target_carbs}g/day)
- Weekly Fat Target: ${weeklyFat}g (${profile.target_fat}g/day)

**Your ingredient selection with quantities MUST provide enough total calories and macros to meet these weekly targets.**

## USER CONTEXT
- Meal prep time available: ${prepComplexity} (${profile.prep_time} minutes per meal max)
- Dietary preferences: ${dietaryPrefsText}
- Meals per day: ${profile.meals_per_day}

## INGREDIENT COUNTS REQUESTED BY USER
The user wants their weekly grocery list to include:
- Proteins: ${varietyPrefs.proteins} different options
- Vegetables: ${varietyPrefs.vegetables} different options
- Fruits: ${varietyPrefs.fruits} different options
- Grains/Starches: ${varietyPrefs.grains} different options
- Healthy Fats: ${varietyPrefs.fats} different options
- Pantry Staples: ${varietyPrefs.pantry} different options
${nutritionReference}
## INSTRUCTIONS
Select ingredients AND estimate weekly quantities that:
1. TOTAL to approximately ${weeklyCalories} calories for the week
2. Provide approximately ${weeklyProtein}g protein for the week
3. Are versatile and can be prepared multiple ways
4. Are commonly available at grocery stores
5. Work well for batch cooking
6. Match the user's dietary preferences

## CALORIE DISTRIBUTION GUIDANCE
A typical distribution for ${weeklyCalories} weekly calories:
- Proteins should provide ~35-40% of calories (~${Math.round(weeklyCalories * 0.35)} cal)
- Grains/Starches should provide ~25-30% of calories (~${Math.round(weeklyCalories * 0.25)} cal)
- Fats should provide ~20-25% of calories (~${Math.round(weeklyCalories * 0.20)} cal)
- Fruits, vegetables, and pantry items make up the rest

## INGREDIENT SELECTION GUIDELINES
- **Proteins**: Focus on lean, versatile options. 4oz chicken breast = ~140 cal, 26g protein. 4oz salmon = ~180 cal, 25g protein.
- **Vegetables**: Mix of colors - broccoli, spinach, bell peppers, sweet potatoes. Low calorie but essential for nutrients.
- **Fruits**: Fresh fruits for energy - banana = ~105 cal, berries = ~70-85 cal/cup.
- **Grains/Starches**: 1 cup cooked rice = ~215 cal, 1 cup quinoa = ~220 cal, 1 medium sweet potato = ~105 cal.
- **Healthy Fats**: Calorie-dense - 1 tbsp olive oil = 120 cal, 1 oz almonds = 165 cal, 1/2 avocado = 160 cal.
- **Pantry Staples**: Eggs (70 cal each), Greek yogurt (130 cal/cup), beans (110 cal/half cup).

## CONSTRAINTS
- Select EXACTLY the number of items requested per category
- Prioritize ingredients that can be used in multiple meals
- ONLY recommend healthy, whole foods that are non-processed or minimally processed
- **Quantities must add up to approximately ${weeklyCalories} total weekly calories**

Return ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "proteins": ["Chicken breast", "Ground beef 90% lean", "Salmon"],
  "vegetables": ["Broccoli", "Bell peppers", "Spinach", "Sweet potatoes", "Zucchini"],
  "fruits": ["Bananas", "Mixed berries"],
  "grains": ["Quinoa", "Brown rice"],
  "fats": ["Avocado", "Olive oil", "Almonds"],
  "pantry": ["Eggs", "Greek yogurt", "Black beans"]
}`;

  const startTime = Date.now();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const duration = Date.now() - startTime;

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Log the LLM call
  await logLLMCall({
    user_id: userId,
    prompt,
    output: responseText,
    model: 'claude-sonnet-4-20250514',
    prompt_type: 'two_stage_core_ingredients',
    tokens_used: message.usage?.output_tokens,
    duration_ms: duration,
  });

  // Parse the JSON response
  const parsed = extractAndParseJSON<CoreIngredients>(responseText, 'core ingredients');
  return parsed;
}

/**
 * Stage 2: Generate meals using ONLY the core ingredients
 * Creates meals constrained to the selected ingredients
 * Properly handles multiple snacks per day
 */
async function generateMealsFromCoreIngredients(
  profile: UserProfile,
  coreIngredients: CoreIngredients,
  userId: string,
  mealPreferences?: { liked: string[]; disliked: string[] },
  validatedMeals?: ValidatedMealMacros[]
): Promise<{ meals: Array<MealWithIngredientNutrition & { day: DayOfWeek }> }> {
  const dietaryPrefs = profile.dietary_prefs ?? ['no_restrictions'];
  const dietaryPrefsText = dietaryPrefs
    .map(pref => DIETARY_LABELS[pref] || pref)
    .join(', ') || 'No restrictions';

  const mealConsistencyPrefs = profile.meal_consistency_prefs ?? DEFAULT_MEAL_CONSISTENCY_PREFS;

  // Build the ingredients list as JSON
  const ingredientsJSON = JSON.stringify(coreIngredients, null, 2);

  // Calculate per-meal targets
  const targetCaloriesPerMeal = Math.round(profile.target_calories / profile.meals_per_day);
  const targetProteinPerMeal = Math.round(profile.target_protein / profile.meals_per_day);
  const targetCarbsPerMeal = Math.round(profile.target_carbs / profile.meals_per_day);
  const targetFatPerMeal = Math.round(profile.target_fat / profile.meals_per_day);

  // Determine meal types needed and count snacks
  const mealTypesNeeded = getMealTypesForPlan(profile.meals_per_day);
  const snacksPerDay = mealTypesNeeded.filter(t => t === 'snack').length;
  const uniqueMealTypes = Array.from(new Set(mealTypesNeeded)) as MealType[];

  // Build consistency instructions with proper snack count
  const consistencyInstructions = uniqueMealTypes.map(type => {
    const isConsistent = mealConsistencyPrefs[type] === 'consistent';
    if (type === 'snack' && snacksPerDay > 1) {
      // Special handling for multiple snacks per day
      if (isConsistent) {
        return `- Snack: Generate ${snacksPerDay} different snacks (the user has ${snacksPerDay} snack slots per day, eaten consistently all 7 days)`;
      }
      return `- Snack: Generate ${snacksPerDay * 7} different snacks (${snacksPerDay} per day × 7 days = ${snacksPerDay * 7} total snacks)`;
    }
    if (isConsistent) {
      return `- ${type.charAt(0).toUpperCase() + type.slice(1)}: Generate 1 meal (will be eaten all 7 days)`;
    }
    return `- ${type.charAt(0).toUpperCase() + type.slice(1)}: Generate 7 different meals (one per day)`;
  }).join('\n');

  // Build meal complexity instructions based on user preferences
  const breakfastComplexity = profile.breakfast_complexity || 'minimal_prep';
  const lunchComplexity = profile.lunch_complexity || 'minimal_prep';
  const dinnerComplexity = profile.dinner_complexity || 'full_recipe';

  const complexityInstructions = `
## MEAL COMPLEXITY PREFERENCES
The user has specified how complex they want each meal type:

- **Breakfast**: ${MEAL_COMPLEXITY_LABELS[breakfastComplexity as MealComplexity].title} (${MEAL_COMPLEXITY_LABELS[breakfastComplexity as MealComplexity].time})
  ${breakfastComplexity === 'quick_assembly' ? 'Simple ingredient lists, minimal to no cooking. Just combine pre-cooked or raw ingredients.' : ''}
  ${breakfastComplexity === 'minimal_prep' ? 'Brief cooking steps, single cooking method. Simple recipes.' : ''}
  ${breakfastComplexity === 'full_recipe' ? 'Multi-step recipes with detailed instructions are OK.' : ''}

- **Lunch**: ${MEAL_COMPLEXITY_LABELS[lunchComplexity as MealComplexity].title} (${MEAL_COMPLEXITY_LABELS[lunchComplexity as MealComplexity].time})
  ${lunchComplexity === 'quick_assembly' ? 'Simple ingredient lists, minimal to no cooking. Just combine pre-cooked or raw ingredients.' : ''}
  ${lunchComplexity === 'minimal_prep' ? 'Brief cooking steps, single cooking method. Simple recipes.' : ''}
  ${lunchComplexity === 'full_recipe' ? 'Multi-step recipes with detailed instructions are OK.' : ''}

- **Dinner**: ${MEAL_COMPLEXITY_LABELS[dinnerComplexity as MealComplexity].title} (${MEAL_COMPLEXITY_LABELS[dinnerComplexity as MealComplexity].time})
  ${dinnerComplexity === 'quick_assembly' ? 'Simple ingredient lists, minimal to no cooking. Just combine pre-cooked or raw ingredients.' : ''}
  ${dinnerComplexity === 'minimal_prep' ? 'Brief cooking steps, single cooking method. Simple recipes.' : ''}
  ${dinnerComplexity === 'full_recipe' ? 'Multi-step recipes with detailed instructions are OK.' : ''}

IMPORTANT: Match the prep_time_minutes to the complexity level. Quick assembly should be 2-10 min, minimal prep 10-20 min, full recipe 20-45 min.
`;

  let preferencesSection = '';
  if (mealPreferences) {
    const parts: string[] = [];
    if (mealPreferences.liked.length > 0) {
      parts.push(`**Meals the user LIKES** (create similar meals): ${mealPreferences.liked.join(', ')}`);
    }
    if (mealPreferences.disliked.length > 0) {
      parts.push(`**Meals the user DISLIKES** (avoid similar meals): ${mealPreferences.disliked.join(', ')}`);
    }
    if (parts.length > 0) {
      preferencesSection = `\n## User Preferences\n${parts.join('\n')}\n`;
    }
  }

  let validatedMealsSection = '';
  if (validatedMeals && validatedMeals.length > 0) {
    const mealsList = validatedMeals.map(m =>
      `- "${m.meal_name}": ${m.calories} kcal, ${m.protein}g protein, ${m.carbs}g carbs, ${m.fat}g fat`
    ).join('\n');
    validatedMealsSection = `
## User-Validated Meal Nutrition Data
When generating these meals or similar ones, use these macro values as reference:
${mealsList}
`;
  }

  // Fetch cached nutrition data for the core ingredients
  const allIngredientNames = [
    ...coreIngredients.proteins,
    ...coreIngredients.vegetables,
    ...coreIngredients.fruits,
    ...coreIngredients.grains,
    ...coreIngredients.fats,
    ...coreIngredients.pantry,
  ];
  const nutritionCache = await fetchCachedNutrition(allIngredientNames);
  const nutritionReference = buildNutritionReferenceSection(nutritionCache);

  // Calculate total meals needed
  const totalMealsPerDay = profile.meals_per_day;
  const totalMealsPerWeek = totalMealsPerDay * 7;

  // Build snack-specific instructions if multiple snacks per day
  let snackInstructions = '';
  if (snacksPerDay > 1) {
    snackInstructions = `
## IMPORTANT: MULTIPLE SNACKS PER DAY
The user has ${snacksPerDay} snack slots per day. You MUST generate ${snacksPerDay} snacks for each day.
- Label them with "snack_number": 1 or 2 (or 3 if applicable) to distinguish them
- Each day needs: breakfast, lunch, dinner, AND ${snacksPerDay} snacks
- Total snacks needed: ${snacksPerDay * 7} (${snacksPerDay} per day × 7 days)
`;
  }

  // Build household context if user has household members
  const householdServings = profile.household_servings ?? DEFAULT_HOUSEHOLD_SERVINGS_PREFS;
  const householdSection = buildHouseholdContextSection(householdServings);

  const prompt = `You are generating a 7-day meal plan for a CrossFit athlete.

**CRITICAL CONSTRAINT**: You MUST use ONLY the ingredients provided below. Do NOT add any new ingredients.
${preferencesSection}${validatedMealsSection}${householdSection}
## CORE INGREDIENTS (USE ONLY THESE)
${ingredientsJSON}
${nutritionReference}
## USER MACROS (daily targets) - MUST BE MET
- **Daily Calories: ${profile.target_calories} kcal** (this is the PRIMARY goal)
- Daily Protein: ${profile.target_protein}g
- Daily Carbs: ${profile.target_carbs}g
- Daily Fat: ${profile.target_fat}g
- Dietary Preferences: ${dietaryPrefsText}
- Max Prep Time Per Meal: ${profile.prep_time} minutes
- Meals Per Day: ${profile.meals_per_day}

## TARGET MACROS PER MEAL (approximately)
- Calories: ~${targetCaloriesPerMeal} kcal per meal
- Protein: ~${targetProteinPerMeal}g per meal
- Carbs: ~${targetCarbsPerMeal}g per meal
- Fat: ~${targetFatPerMeal}g per meal

**CRITICAL**: Each day's meals MUST total approximately ${profile.target_calories} calories.
Do NOT generate meals that total significantly less than this target (within 5-10% is acceptable).

## MEAL CONSISTENCY SETTINGS
${consistencyInstructions}
${complexityInstructions}
${snackInstructions}
## INSTRUCTIONS
1. **PRIORITIZE HITTING CALORIE TARGETS** - use adequate portion sizes
2. Create variety through different:
   - Cooking methods (grilled, baked, stir-fried, steamed, raw)
   - Flavor profiles (Mediterranean, Asian, Mexican, Italian, American)
   - Meal structures (bowls, salads, plates, wraps using lettuce)
3. Design meals that work well for batch cooking
4. Use realistic portion sizes that add up to daily calorie targets
5. Consider meal prep efficiency

## CRITICAL RULES
- Use ONLY the provided ingredients (you may use basic seasonings like salt, pepper, garlic, onion, herbs, and spices)
- Do NOT introduce new proteins, vegetables, fruits, grains, fats, or pantry items beyond what's listed
- Create variety through preparation methods, not new ingredients
- Verify that calories approximately = (protein × 4) + (carbs × 4) + (fat × 9)
- **MUST generate exactly ${totalMealsPerDay} meals per day (${totalMealsPerWeek} total)**

## RESPONSE FORMAT
Return ONLY valid JSON with this exact structure:
{
  "meals": [
    {
      "day": "monday",
      "type": "breakfast",${snacksPerDay > 1 ? '\n      "snack_number": 1,' : ''}
      "name": "Greek Yogurt Power Bowl",
      "ingredients": [
        {"name": "Greek yogurt", "amount": "1", "unit": "cup", "category": "dairy", "calories": 130, "protein": 17, "carbs": 8, "fat": 0},
        {"name": "Berries", "amount": "0.5", "unit": "cup", "category": "produce", "calories": 35, "protein": 0.5, "carbs": 8.5, "fat": 0.25},
        {"name": "Almonds", "amount": "1", "unit": "oz", "category": "pantry", "calories": 165, "protein": 6, "carbs": 6, "fat": 14}
      ],
      "instructions": ["Add yogurt to bowl", "Top with berries and almonds"],
      "prep_time_minutes": 5,
      "macros": {
        "calories": 330,
        "protein": 23.5,
        "carbs": 22.5,
        "fat": 14.25
      }
    }
  ]
}

**CRITICAL NUTRITION REQUIREMENTS**:
1. **Each ingredient MUST include its individual nutrition values** (calories, protein, carbs, fat) for the specified amount
2. The meal's total macros MUST equal the SUM of all ingredient macros (verify this before outputting)
3. Use the nutrition reference data provided above when available
4. For ingredients not in the reference, estimate based on USDA standards

Generate all ${totalMealsPerWeek} meals for all 7 days in a single "meals" array.
Order by day (monday first), then by meal type (breakfast, snack, lunch, snack, dinner for 5 meals/day).
${snacksPerDay > 1 ? `Include "snack_number" field for snacks to distinguish snack 1 from snack 2.` : ''}`;

  const startTime = Date.now();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });
  const duration = Date.now() - startTime;

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Log the LLM call
  await logLLMCall({
    user_id: userId,
    prompt,
    output: responseText,
    model: 'claude-sonnet-4-20250514',
    prompt_type: 'two_stage_meals_from_ingredients',
    tokens_used: message.usage?.output_tokens,
    duration_ms: duration,
  });

  // Check for truncation
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Response was truncated when generating meals from core ingredients.');
  }

  // Parse the JSON response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = extractAndParseJSON<any>(responseText, 'meals from core ingredients');

  // Cache all unique ingredients to ingredient_nutrition table
  // This builds our ingredient database over time for consistency
  const ingredientMap = new Map<string, {
    name: string;
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>();

  for (const meal of parsed.meals || []) {
    for (const ingredient of meal.ingredients || []) {
      // Create a unique key based on normalized name + serving size + unit
      const normalizedName = ingredient.name.toLowerCase().trim();
      const servingSize = parseFloat(ingredient.amount) || 1;
      const servingUnit = ingredient.unit || 'serving';
      const key = `${normalizedName}|${servingSize}|${servingUnit}`;

      // Only add if we haven't seen this exact ingredient+serving combo
      // and it has valid nutrition data
      if (!ingredientMap.has(key) &&
          ingredient.calories !== undefined &&
          ingredient.protein !== undefined &&
          ingredient.carbs !== undefined &&
          ingredient.fat !== undefined) {
        ingredientMap.set(key, {
          name: ingredient.name,
          serving_size: servingSize,
          serving_unit: servingUnit,
          calories: ingredient.calories,
          protein: ingredient.protein,
          carbs: ingredient.carbs,
          fat: ingredient.fat,
        });
      }
    }
  }

  // Cache all unique ingredients (async, don't block return)
  if (ingredientMap.size > 0) {
    const ingredientsToCache = Array.from(ingredientMap.values());
    // Fire and forget - don't wait for caching to complete
    cacheIngredientNutrition(ingredientsToCache).catch(err => {
      console.error('Failed to cache ingredient nutrition:', err);
    });
  }

  return parsed;
}

// New prep sessions response type for the collapsible prep view
// Extended prep task as returned by LLM (matches new PrepTask interface)
interface LLMPrepTask {
  id: string;
  description: string;
  detailed_steps: string[];
  cooking_temps?: {
    oven?: string;
    stovetop?: string;
    internal_temp?: string;
    grill?: string;
  };
  cooking_times?: {
    prep_time?: string;
    cook_time?: string;
    rest_time?: string;
    total_time?: string;
  };
  tips?: string[];
  storage?: string;
  estimated_minutes: number;
  meal_ids: string[];
  completed: boolean;
  // NEW: Equipment and ingredients needed before starting
  equipment_needed?: string[];
  ingredients_to_prep?: string[];
}

interface NewPrepSessionsResponse {
  prep_sessions: Array<{
    session_name: string;
    session_type: PrepSessionType;
    session_day: DayOfWeek | null;
    session_time_of_day: 'morning' | 'afternoon' | 'night' | null;
    prep_for_date: string | null;
    estimated_minutes: number;
    prep_tasks: LLMPrepTask[];
    display_order: number;
  }>;
  daily_assembly?: DailyAssembly;
}

/**
 * Stage 3: Analyze meals and generate prep sessions
 * Creates prep sessions based on user's prep style preference
 * Supports: traditional_batch, night_before, day_of, mixed
 */
async function generatePrepSessions(
  days: DayPlan[],
  coreIngredients: CoreIngredients,
  profile: UserProfile,
  userId: string,
  weekStartDate?: string
): Promise<PrepModeResponse> {
  const prepStyle = profile.prep_style || 'mixed';

  // Build meal IDs for reference
  const mealIds: Record<string, string> = {};
  days.forEach((day) => {
    day.meals.forEach((meal, mealIndex) => {
      const id = `meal_${day.day}_${meal.type}_${mealIndex}`;
      mealIds[`${day.day}_${meal.type}_${mealIndex}`] = id;
    });
  });

  // Build a detailed summary of the meal plan with IDs AND instructions
  // This gives the LLM the actual cooking steps to create accurate prep tasks
  const mealSummary = days.map(day => {
    const mealsList = day.meals.map((m, idx) => {
      const mealId = `meal_${day.day}_${m.type}_${idx}`;
      const ingredientsList = m.ingredients.map(ing => `${ing.amount} ${ing.unit} ${ing.name}`).join(', ');
      const instructionsList = m.instructions.length > 0
        ? `\n      Instructions: ${m.instructions.map((inst, i) => `${i + 1}. ${inst}`).join(' ')}`
        : '';
      return `  - ${m.type} (ID: ${mealId}): ${m.name}
      Prep time: ${m.prep_time_minutes}min | Protein: ${m.macros.protein}g
      Ingredients: ${ingredientsList}${instructionsList}`;
    }).join('\n');
    return `${day.day.charAt(0).toUpperCase() + day.day.slice(1)}:\n${mealsList}`;
  }).join('\n\n');

  // Get meal complexities
  const breakfastComplexity = profile.breakfast_complexity || 'minimal_prep';
  const lunchComplexity = profile.lunch_complexity || 'minimal_prep';
  const dinnerComplexity = profile.dinner_complexity || 'full_recipe';

  // Calculate week dates for prep_for_date
  const weekStart = weekStartDate ? new Date(weekStartDate) : new Date();
  const dayDates: Record<DayOfWeek, string> = {
    monday: new Date(weekStart).toISOString().split('T')[0],
    tuesday: new Date(new Date(weekStart).setDate(weekStart.getDate() + 1)).toISOString().split('T')[0],
    wednesday: new Date(new Date(weekStart).setDate(weekStart.getDate() + 2)).toISOString().split('T')[0],
    thursday: new Date(new Date(weekStart).setDate(weekStart.getDate() + 3)).toISOString().split('T')[0],
    friday: new Date(new Date(weekStart).setDate(weekStart.getDate() + 4)).toISOString().split('T')[0],
    saturday: new Date(new Date(weekStart).setDate(weekStart.getDate() + 5)).toISOString().split('T')[0],
    sunday: new Date(new Date(weekStart).setDate(weekStart.getDate() + 6)).toISOString().split('T')[0],
  };

  const prepStyleInstructions = {
    traditional_batch: `
## PREP STYLE: Traditional Batch Prep
Create 1-2 prep sessions:
1. **Main Batch Prep** (Sunday or Saturday): 1.5-2.5 hours of major cooking
2. **Optional Mid-Week Refresh** (Wednesday): 30-45 min if needed

Group all batch cooking together. Only truly no-cook assembly meals (like grabbing a pre-made snack) should be excluded.
`,
    night_before: `
## PREP STYLE: Night Before
Create 6-7 prep sessions, one for each night (Sunday night through Saturday night).
Each session prepares the NEXT day's meals.

Example:
- "Sunday Night (for Monday)" - prep Monday's meals
- "Monday Night (for Tuesday)" - prep Tuesday's meals
- etc.

Session types should be "night_before".
Group tasks that can be done together (e.g., marinating protein while chopping veggies).
Include ALL meals that have any cooking or prep steps - even "simple" meals like overnight oats need prep instructions.
`,
    day_of: `
## PREP STYLE: Day-Of Fresh Cooking
The user wants to cook fresh for every meal. This means they need DETAILED prep instructions for EVERY meal that involves ANY cooking or preparation.

CRITICAL RULES FOR DAY-OF STYLE:
1. Create a prep session for EVERY meal that requires:
   - Any heat (stove, oven, microwave, grill)
   - Any mixing, chopping, or assembly that takes more than 2 minutes
   - Any advance prep (like soaking oats overnight)

2. ONLY skip meals that are truly grab-and-go (like eating a banana or pre-made protein bar)

3. Session types:
   - "day_of_morning" for breakfast prep
   - "day_of_morning" for lunch prep (done in the morning or at lunchtime)
   - "day_of_dinner" for dinner prep

4. Include ALL meals with cooking verbs in their instructions (bake, sear, roast, grill, sauté, simmer, boil, fry, toast, heat, cook, etc.)

5. Even "simple" meals like eggs, oatmeal, or salads with cooked protein NEED prep sessions with proper instructions.

User's complexity preferences:
- Breakfast: ${breakfastComplexity}
- Lunch: ${lunchComplexity}
- Dinner: ${dinnerComplexity}

NOTE: Complexity preference does NOT mean skip the prep session. It just indicates how complex the user expects meals to be. ALL cooked meals need prep instructions regardless of complexity level.
`,
    mixed: `
## PREP STYLE: Mixed/Flexible
This is the most common choice. Create a balanced prep schedule:

1. **Weekly Batch Prep** (optional, if helpful): Batch cook proteins that appear in multiple meals
2. **Night Before** sessions for meals that benefit from advance prep
3. **Day-Of** sessions for full_recipe dinners that users want fresh

COMPLEXITY-BASED LOGIC:
- quick_assembly meals: Only skip if truly no cooking involved
- minimal_prep meals: Can be prepped night before OR batched if similar across days
- full_recipe meals: Prep night before for components, or cook day-of for freshness

For this user:
- Breakfast: ${breakfastComplexity} → ${breakfastComplexity === 'quick_assembly' ? 'Minimal prep, but include if any cooking' : breakfastComplexity === 'minimal_prep' ? 'Quick night-before prep or batch' : 'May need dedicated prep'}
- Lunch: ${lunchComplexity} → ${lunchComplexity === 'quick_assembly' ? 'Minimal prep, but include if any cooking' : lunchComplexity === 'minimal_prep' ? 'Quick night-before prep or batch' : 'May need dedicated prep'}
- Dinner: ${dinnerComplexity} → ${dinnerComplexity === 'quick_assembly' ? 'Minimal prep' : dinnerComplexity === 'minimal_prep' ? 'Quick night-before prep' : 'Night-before prep or day-of cooking'}
`,
  };

  // Build household context for prep instructions
  const householdServings = profile.household_servings ?? DEFAULT_HOUSEHOLD_SERVINGS_PREFS;
  const householdHasMembers = hasHouseholdMembers(householdServings);

  // Build a day/meal specific household servings summary for prep
  let householdPrepSection = '';
  if (householdHasMembers) {
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
    const servingLines: string[] = [];

    for (const day of DAYS_OF_WEEK) {
      const dayParts: string[] = [];
      for (const meal of mealTypes) {
        const multiplier = getServingMultiplier(householdServings, day, meal);
        if (multiplier > 1) {
          dayParts.push(`${meal}: ${multiplier.toFixed(1)}x`);
        }
      }
      if (dayParts.length > 0) {
        servingLines.push(`- ${DAY_OF_WEEK_LABELS[day]}: ${dayParts.join(', ')}`);
      }
    }

    householdPrepSection = `
## HOUSEHOLD SERVINGS - CRITICAL FOR PREP INSTRUCTIONS
The athlete is cooking for their household. Your prep instructions MUST include quantities for the FULL batch, not just the athlete.

**Serving multipliers by day/meal:**
${servingLines.join('\n')}

**IMPORTANT for prep instructions:**
- Scale ALL ingredient quantities in detailed_steps for the full household
- Example: If Monday dinner is 2.2x servings, and the base recipe calls for "4 oz salmon", write "9 oz salmon (2.2 servings)"
- Include the multiplier or total servings in your instructions so the user knows the batch size
- Meals with 1.0x multiplier are just for the athlete (no scaling needed)
`;
  }

  const prompt = `You are creating a DETAILED prep schedule for a CrossFit athlete's weekly meal plan. The user needs ACTIONABLE cooking instructions, not just meal descriptions.

## MEAL PLAN WITH FULL DETAILS
${mealSummary}

## CORE INGREDIENTS
${JSON.stringify(coreIngredients, null, 2)}

## WEEK DATES
${JSON.stringify(dayDates, null, 2)}
${householdPrepSection}
${prepStyleInstructions[prepStyle as PrepStyle]}

## CRITICAL RULES

### RULE 1: ONE TASK PER MEAL (NOT PER INGREDIENT)
Each prep_task should represent ONE COMPLETE MEAL, not individual ingredients.
- WRONG: Separate tasks for "Roast sweet potato" and "Roast asparagus" for the same dinner
- RIGHT: One task "Monday Dinner: Salmon with Roasted Vegetables" that includes ALL steps for that meal

### RULE 2: INCLUDE EVERY SINGLE MEAL
Create a prep task for EVERY meal in the meal plan, even simple ones:
- Even "Greek yogurt with berries" needs a task: "Scoop yogurt into bowl, top with berries"
- Even "Avocado toast" needs a task: "Toast bread, mash avocado, spread on toast, season with salt"
- NO MEAL should be skipped. If someone asks "what do I do for Tuesday lunch?" there must be a task for it.

### RULE 3: ACTIONABLE STEP-BY-STEP INSTRUCTIONS
Your detailed_steps must be ACTUALLY HELPFUL with real cooking guidance.

BAD (useless - just restates the meal):
- "Prepare overnight oats with Greek yogurt and berries"

GOOD (actionable with real details):
- detailed_steps: [
    "Combine 1/2 cup rolled oats, 1/2 cup Greek yogurt, and 1/2 cup milk in a jar",
    "Stir in 1 tbsp chia seeds and 1 tsp honey",
    "Refrigerate overnight (at least 6 hours)",
    "Top with fresh berries before serving"
  ]

## PREP TASK STRUCTURE

Each prep_task represents ONE MEAL and MUST include:
1. "id": Unique identifier (e.g., "meal_monday_breakfast")
2. "description": The meal name (e.g., "Monday Breakfast: Overnight Oats with Berries")
3. "equipment_needed": Array of ALL cookware and tools needed (THIS IS REQUIRED - see examples below)
4. "ingredients_to_prep": Array of ingredients to gather/prep before starting (THIS IS REQUIRED)
5. "detailed_steps": Array of ALL steps to prepare this meal (THIS IS REQUIRED - never leave empty)
6. "cooking_temps": Object with temperature info (if applicable):
   - "oven": e.g., "400°F" or "200°C"
   - "stovetop": e.g., "medium-high heat"
   - "internal_temp": e.g., "145°F for salmon", "165°F for chicken"
   - "grill": e.g., "medium-high, 400-450°F"
7. "cooking_times": Object with timing info:
   - "prep_time": e.g., "5 min"
   - "cook_time": e.g., "15-20 min"
   - "rest_time": e.g., "5 min" (if applicable)
   - "total_time": e.g., "25 min"
8. "tips": Array of helpful pro tips (optional but encouraged)
9. "storage": Storage instructions (REQUIRED for batch prep and night-before styles, optional for day-of)
   - e.g., "Refrigerate in airtight container for up to 5 days"
   - e.g., "Store in glass meal prep containers, keeps 4-5 days refrigerated"
   - e.g., "Portion into individual containers for grab-and-go"
10. "estimated_minutes": Total time in minutes
11. "meal_ids": Array with the single meal_id this task is for
12. "completed": false

## CRITICAL: EQUIPMENT_NEEDED EXAMPLES

**For "Asian-Style Ground Turkey with Jasmine Rice and Vegetables":**
equipment_needed: ["Large skillet or wok (for turkey and vegetables)", "Medium pot with lid (for rice)", "Cutting board", "Chef's knife", "Wooden spoon or spatula", "Measuring spoons"]

**For "Baked Salmon with Roasted Vegetables":**
equipment_needed: ["Large baking sheet (for salmon)", "Separate baking sheet (for vegetables)", "Parchment paper or foil", "Tongs or spatula", "Small bowl (for seasoning mix)"]

**For "Overnight Oats":**
equipment_needed: ["Mason jar or airtight container", "Spoon for mixing"]

## CRITICAL: INGREDIENTS_TO_PREP EXAMPLES

**For "Asian-Style Ground Turkey with Jasmine Rice and Vegetables":**
ingredients_to_prep: ["1.5 lbs ground turkey", "2 cups jasmine rice", "1 onion, diced", "8 oz mushrooms, sliced", "2 cups red cabbage, shredded", "1.5 tbsp coconut oil", "Garlic powder, salt, pepper, ginger"]

This helps users gather everything BEFORE they start cooking.

## CRITICAL: DETAILED_STEPS WITH VESSEL CLARITY

Your detailed_steps MUST specify which cookware is being used at each step:

**BAD (unclear which vessel):**
- "Add ground turkey, cook 5-6 minutes until browned"
- "Add mushrooms and cook 3-4 minutes"

**GOOD (clear vessel instructions):**
- "In the large skillet, add 1.5 lbs ground turkey, breaking apart with spoon. Cook 5-6 minutes until browned and no pink remains."
- "To the same skillet with the turkey, add 8 oz sliced mushrooms. Cook 3-4 minutes until tender."
- "Meanwhile, in the medium pot, bring 2 cups water to a boil. Add rice, reduce to low, cover and simmer 15 minutes."

**GOOD (using multiple vessels simultaneously):**
- "While the chicken is baking (check step 2), heat 1 tbsp olive oil in a large skillet over medium heat."
- "In a separate small pot, bring 4 cups water to a boil for the quinoa."

**Key patterns to use:**
- "In the [specific cookware]..."
- "To the same [cookware]..." (when adding to existing pan)
- "In a separate [cookware]..." (when using different vessel)
- "While X is cooking in [cookware A], prepare Y in [cookware B]..."
- "Meanwhile, in [cookware]..." (for parallel tasks)

## RESPONSE FORMAT
Return ONLY valid JSON:
{
  "prep_sessions": [
    {
      "session_name": "Monday Morning Prep",
      "session_type": "day_of_morning",
      "session_day": "monday",
      "session_time_of_day": "morning",
      "prep_for_date": "${dayDates.monday}",
      "estimated_minutes": 20,
      "prep_tasks": [
        {
          "id": "meal_monday_breakfast",
          "description": "Monday Breakfast: Overnight Oats with Berries",
          "equipment_needed": [
            "Mason jar or airtight container",
            "Spoon for mixing"
          ],
          "ingredients_to_prep": [
            "1/2 cup rolled oats",
            "1/2 cup Greek yogurt",
            "1/2 cup milk",
            "1 tbsp chia seeds",
            "1 tsp honey",
            "1/4 cup fresh mixed berries"
          ],
          "detailed_steps": [
            "In the mason jar, combine 1/2 cup rolled oats, 1/2 cup Greek yogurt, and 1/2 cup milk",
            "Add 1 tbsp chia seeds and 1 tsp honey, stir well to combine",
            "Cover and refrigerate overnight (minimum 6 hours)",
            "Before serving, top with 1/4 cup fresh mixed berries"
          ],
          "cooking_times": {
            "prep_time": "5 min",
            "rest_time": "6+ hours (overnight)",
            "total_time": "5 min active"
          },
          "tips": [
            "Prep multiple jars at once for the week",
            "Add berries just before eating to keep them fresh"
          ],
          "storage": "Refrigerate in mason jars for up to 5 days",
          "estimated_minutes": 5,
          "meal_ids": ["meal_monday_breakfast_0"],
          "completed": false
        },
        {
          "id": "meal_monday_lunch",
          "description": "Monday Lunch: Greek Salad with Grilled Chicken",
          "equipment_needed": [
            "Large salad bowl",
            "Cutting board",
            "Chef's knife"
          ],
          "ingredients_to_prep": [
            "1 grilled chicken breast, sliced",
            "1 cucumber, diced",
            "2 tomatoes, chopped",
            "1/4 red onion, sliced",
            "1/4 cup Kalamata olives",
            "2 oz feta cheese, crumbled",
            "2 tbsp olive oil",
            "1 tbsp red wine vinegar",
            "Dried oregano, salt, pepper"
          ],
          "detailed_steps": [
            "On the cutting board, slice chicken breast into strips",
            "Chop cucumber, tomatoes, and red onion into bite-sized pieces",
            "In the large salad bowl, combine all chopped vegetables",
            "Add olives and crumbled feta cheese to the bowl",
            "Top with sliced chicken",
            "Drizzle with olive oil and red wine vinegar, season with oregano"
          ],
          "cooking_times": {
            "prep_time": "10 min",
            "total_time": "10 min"
          },
          "storage": "Keep components separate until serving. Dressing on the side, refrigerate up to 3 days",
          "estimated_minutes": 10,
          "meal_ids": ["meal_monday_lunch_0"],
          "completed": false
        }
      ],
      "display_order": 1
    },
    {
      "session_name": "Monday Dinner Prep",
      "session_type": "day_of_dinner",
      "session_day": "monday",
      "session_time_of_day": "night",
      "prep_for_date": "${dayDates.monday}",
      "estimated_minutes": 45,
      "prep_tasks": [
        {
          "id": "meal_monday_dinner",
          "description": "Monday Dinner: Herb-Crusted Salmon with Roasted Vegetables",
          "equipment_needed": [
            "Large baking sheet (for vegetables)",
            "Large skillet (for salmon)",
            "Cutting board",
            "Chef's knife",
            "Tongs or spatula",
            "Meat thermometer"
          ],
          "ingredients_to_prep": [
            "6 oz salmon fillet",
            "1 medium sweet potato, cubed",
            "1 bunch asparagus, trimmed",
            "2 tbsp olive oil",
            "Salt, pepper, garlic powder, dried dill"
          ],
          "detailed_steps": [
            "Preheat oven to 425°F",
            "On the cutting board, cut sweet potato into 1-inch cubes",
            "On the large baking sheet, toss sweet potato cubes with 1 tbsp olive oil, salt and pepper",
            "Place the baking sheet in the oven and roast for 15 minutes",
            "Meanwhile, on the cutting board, trim woody ends from asparagus",
            "Remove salmon from refrigerator and pat completely dry with paper towels",
            "Season salmon with salt, pepper, garlic powder, and dried dill",
            "Add asparagus to the same baking sheet with sweet potato, drizzle with oil and season",
            "Continue roasting vegetables for 12-15 more minutes",
            "In the large skillet, heat 1 tbsp olive oil over medium-high heat until shimmering",
            "Place salmon in the skillet skin-side up and sear undisturbed for 4 minutes until golden",
            "Using tongs, flip salmon and cook 3-4 minutes more until internal temp reaches 145°F",
            "Let salmon rest 2 minutes, then serve with roasted vegetables from the baking sheet"
          ],
          "cooking_temps": {
            "oven": "425°F",
            "stovetop": "medium-high heat",
            "internal_temp": "145°F (salmon is done)"
          },
          "cooking_times": {
            "prep_time": "15 min",
            "cook_time": "30 min",
            "total_time": "45 min"
          },
          "tips": [
            "Start the vegetables first since they take longer",
            "Don't move the salmon while searing - let the crust form",
            "Cut sweet potato uniformly for even cooking"
          ],
          "storage": "Best served fresh. Leftovers keep 2 days refrigerated, reheat veggies in oven",
          "estimated_minutes": 45,
          "meal_ids": ["meal_monday_dinner_0"],
          "completed": false
        }
      ],
      "display_order": 2
    }
  ],
  "daily_assembly": {
    "monday": {
      "breakfast": { "time": "5 min", "instructions": "Remove overnight oats from fridge, top with fresh berries and enjoy cold" },
      "lunch": { "time": "5 min", "instructions": "Combine prepped salad components, add dressing, toss and serve" },
      "dinner": { "time": "0 min", "instructions": "Serve fresh from cooking" }
    },
    "tuesday": {
      "breakfast": { "time": "5 min", "instructions": "Remove overnight oats from fridge, top with fresh berries and enjoy cold" },
      "lunch": { "time": "5 min", "instructions": "Portion prepped chicken and veggies, microwave 2 min if desired warm" }
    }
  }
}

## IMPORTANT RULES
1. Every meal_id in prep_tasks MUST match the format "meal_[day]_[type]_[index]" from the meal plan above
2. Order sessions by display_order chronologically through the week
3. ONE TASK PER MEAL - combine all components of a meal into a single task
4. EVERY MEAL must have a prep task - even simple assembly meals like "yogurt with fruit"
5. detailed_steps is REQUIRED for every task - never leave it empty or with generic descriptions
6. Include cooking_temps and cooking_times whenever heat/cooking is involved
7. Base your detailed_steps on the actual meal instructions provided above
8. STORAGE: Include storage instructions for any meal that is prepped in advance (required for traditional_batch and night_before styles)
9. DAILY ASSEMBLY (REQUIRED for traditional_batch and night_before styles):
   - For batch prep and night-before styles, include a "daily_assembly" object in your response
   - This tells the user how to assemble/reheat prepped food each day
   - Include instructions for each meal of each day (breakfast, lunch, dinner, snack if applicable)
   - Each entry should have "time" (quick estimate like "5 min") and "instructions" (what to do at meal time)
   - For day_of style, daily_assembly can be empty since food is cooked fresh`;

  const startTime = Date.now();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000, // Increased for detailed prep instructions
    messages: [{ role: 'user', content: prompt }],
  });
  const duration = Date.now() - startTime;

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Log the LLM call
  await logLLMCall({
    user_id: userId,
    prompt,
    output: responseText,
    model: 'claude-sonnet-4-20250514',
    prompt_type: 'prep_mode_analysis',
    tokens_used: message.usage?.output_tokens,
    duration_ms: duration,
  });

  // Parse the JSON response
  const parsed = extractAndParseJSON<NewPrepSessionsResponse>(responseText, 'prep sessions');

  // Convert new format to PrepModeResponse format for backward compatibility
  // The new format includes prep_tasks with detailed_steps, cooking_temps, cooking_times, tips
  const prepModeResponse: PrepModeResponse = {
    prepSessions: parsed.prep_sessions.map(session => ({
      sessionName: session.session_name,
      sessionOrder: session.display_order,
      estimatedMinutes: session.estimated_minutes,
      instructions: `${session.session_type} session${session.session_day ? ` on ${session.session_day}` : ''}`,
      prepItems: session.prep_tasks.map(task => ({
        item: task.description,
        quantity: '',
        method: task.detailed_steps?.join(' → ') || '', // Include detailed steps in method for legacy
        storage: task.storage || '',
        feeds: task.meal_ids.map(mealId => {
          // Parse meal_id format: "meal_monday_lunch_0"
          const parts = mealId.split('_');
          if (parts.length >= 3) {
            return {
              day: parts[1] as DayOfWeek,
              meal: parts[2] as MealType,
            };
          }
          return { day: 'monday' as DayOfWeek, meal: 'dinner' as MealType };
        }),
      })),
      // Store new fields for the UI - ensure detailed fields are preserved
      sessionType: session.session_type,
      sessionDay: session.session_day,
      sessionTimeOfDay: session.session_time_of_day,
      prepForDate: session.prep_for_date,
      prepTasks: session.prep_tasks.map(task => ({
        ...task,
        // Ensure detailed_steps is always an array
        detailed_steps: task.detailed_steps || [],
        // Ensure cooking_temps and cooking_times are preserved
        cooking_temps: task.cooking_temps || undefined,
        cooking_times: task.cooking_times || undefined,
        tips: task.tips || [],
        storage: task.storage || undefined,
        // NEW: Preserve equipment and ingredients fields
        equipment_needed: task.equipment_needed || undefined,
        ingredients_to_prep: task.ingredients_to_prep || undefined,
      })),
      displayOrder: session.display_order,
    })),
    dailyAssembly: parsed.daily_assembly || {},
  };

  // Store the raw new format for the new prep view UI
  (prepModeResponse as PrepModeResponse & { newPrepSessions: NewPrepSessionsResponse['prep_sessions'] }).newPrepSessions = parsed.prep_sessions;

  return prepModeResponse;
}

/**
 * Get a human-readable description of the household size
 */
function getHouseholdDescription(servings: HouseholdServingsPrefs): string {
  let totalAdults = 1; // Athlete
  let totalChildren = 0;

  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

  for (const day of DAYS_OF_WEEK) {
    for (const meal of mealTypes) {
      const dayServings = servings[day]?.[meal];
      if (dayServings) {
        totalAdults = Math.max(totalAdults, 1 + (dayServings.adults || 0));
        totalChildren = Math.max(totalChildren, dayServings.children || 0);
      }
    }
  }

  if (totalChildren > 0) {
    return `${totalAdults} adults and ${totalChildren} children`;
  }
  return totalAdults === 1 ? 'just the athlete' : `${totalAdults} adults`;
}

/**
 * Generate grocery list from core ingredients
 * Converts core ingredients to practical shopping quantities
 * Scales quantities based on household servings
 */
async function generateGroceryListFromCoreIngredients(
  coreIngredients: CoreIngredients,
  days: DayPlan[],
  userId: string,
  profile?: UserProfile
): Promise<Ingredient[]> {
  // First, collect all ingredient usage from meals to understand quantities
  const ingredientUsage: Map<string, { count: number; amounts: string[] }> = new Map();

  for (const day of days) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients) {
        const key = ing.name.toLowerCase();
        const existing = ingredientUsage.get(key) || { count: 0, amounts: [] };
        existing.count += 1;
        existing.amounts.push(`${ing.amount} ${ing.unit}`);
        ingredientUsage.set(key, existing);
      }
    }
  }

  // Build usage summary
  const usageSummary = Array.from(ingredientUsage.entries())
    .map(([name, data]) => `${name}: used ${data.count} times (${data.amounts.join(', ')})`)
    .join('\n');

  // Calculate household scaling if applicable
  const householdServings = profile?.household_servings ?? DEFAULT_HOUSEHOLD_SERVINGS_PREFS;
  const avgMultiplier = getAverageServingMultiplier(householdServings);
  const householdHasMembers = hasHouseholdMembers(householdServings);

  let householdScalingSection = '';
  if (householdHasMembers) {
    householdScalingSection = `
## HOUSEHOLD SCALING - READ CAREFULLY
The ingredient usage above shows ATHLETE-ONLY portions (1 person).
The household has ${getHouseholdDescription(householdServings)}, which means an average of ${avgMultiplier.toFixed(1)}x portions per meal.

**YOUR TASK**: Multiply the total ingredient amounts by approximately ${avgMultiplier.toFixed(1)}x to account for the full household, THEN consolidate into practical shopping quantities.

Example: If the athlete uses "chicken breast: 8 oz × 7 meals = 56 oz (3.5 lb)" for the week,
the household (${avgMultiplier.toFixed(1)}x) needs approximately ${(3.5 * avgMultiplier).toFixed(1)} lb total.
`;
  } else {
    householdScalingSection = `
## SCALING NOTE
This meal plan is for a SINGLE PERSON (the athlete only). No household scaling needed.
Simply consolidate the ingredient usage into practical shopping quantities.
`;
  }

  const prompt = `You are creating a practical grocery shopping list from a meal plan's core ingredients.

## CORE INGREDIENTS
${JSON.stringify(coreIngredients, null, 2)}

## INGREDIENT USAGE IN MEALS
${usageSummary}
${householdScalingSection}

## CRITICAL: REASONABLENESS CHECKS
Before finalizing quantities, validate that they make sense for ONE WEEK of meals:

**Red flags that indicate you're calculating wrong:**
- More than 15 of any single fruit or vegetable (e.g., 40 bell peppers is WRONG)
- More than 20 of any citrus or small fruit (e.g., 26 oranges is WRONG)
- More than 12 avocados (unless explicitly used in every single meal)
- More than 5 lbs of any single vegetable
- More than 8 lbs total protein for a household of 2-4 people

**Realistic weekly quantities for a household of 3-4 people:**
- Proteins: 4-6 lbs total (e.g., 2 lbs chicken + 2 lbs ground turkey + 1.5 lbs fish)
- Leafy greens: 1-2 bags spinach, 1 bunch kale
- Vegetables: 6-10 bell peppers MAX, 4-6 zucchini, 3-5 lbs broccoli
- Fruits: 2 bunches bananas (6-8 bananas), 6-12 oranges, 6-10 avocados
- Sweet potatoes: 3-5 lbs
- Grains: 2-3 lbs rice, 1-2 bags/boxes oats

If your calculated quantities exceed these by 2x or more, you're scaling incorrectly.

## INSTRUCTIONS
Convert these core ingredients into a practical grocery shopping list with realistic quantities.

**SCALING REMINDER:**
${householdHasMembers
  ? `The usage data above shows ATHLETE-ONLY portions. You MUST apply the ${avgMultiplier.toFixed(1)}x household multiplier when calculating totals, then consolidate into practical shopping units.`
  : `The usage data shows athlete-only portions. Round up slightly for shopping convenience.`}

Use practical shopping quantities:
- Use "whole" or count for items bought individually (e.g., "6" bell peppers, NOT "40")
- Use "lb" or "oz" for meats and proteins
- Use "bag" for items typically sold in bags
- Use "bunch" for herbs and leafy greens
- Use "container" or "package" for yogurt, tofu, etc.
- Round up modestly to ensure enough food, but stay realistic

## RESPONSE FORMAT
Return ONLY valid JSON:
{
  "grocery_list": [
    {"name": "Chicken breast", "amount": "4", "unit": "lb", "category": "protein"},
    {"name": "Bell peppers", "amount": "8", "unit": "whole", "category": "produce"},
    {"name": "Greek yogurt", "amount": "2", "unit": "container", "category": "dairy"}
  ]
}

Sort by category: produce, protein, dairy, grains, pantry, frozen, other`;

  const startTime = Date.now();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });
  const duration = Date.now() - startTime;

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  await logLLMCall({
    user_id: userId,
    prompt,
    output: responseText,
    model: 'claude-sonnet-4-20250514',
    prompt_type: 'two_stage_grocery_list',
    tokens_used: message.usage?.output_tokens,
    duration_ms: duration,
  });

  // Parse the JSON response
  const parsed = extractAndParseJSON<{ grocery_list: Ingredient[] }>(responseText, 'grocery list from core ingredients');

  // Define reasonable maximum quantities for a week's worth of groceries
  // These limits are generous enough for a family of 4-5 but prevent absurd quantities
  const maxQuantities: Record<string, { max: number; unit: string }> = {
    // Produce - whole items
    'bell pepper': { max: 12, unit: 'whole' },
    'avocado': { max: 14, unit: 'whole' },
    'orange': { max: 18, unit: 'whole' },
    'apple': { max: 18, unit: 'whole' },
    'banana': { max: 14, unit: 'whole' },
    'lemon': { max: 10, unit: 'whole' },
    'lime': { max: 10, unit: 'whole' },
    'onion': { max: 8, unit: 'whole' },
    'zucchini': { max: 10, unit: 'whole' },
    'cucumber': { max: 8, unit: 'whole' },
    'tomato': { max: 12, unit: 'whole' },
    'sweet potato': { max: 10, unit: 'whole' },
    // Proteins - by weight
    'chicken': { max: 8, unit: 'lb' },
    'beef': { max: 6, unit: 'lb' },
    'salmon': { max: 5, unit: 'lb' },
    'fish': { max: 5, unit: 'lb' },
    'turkey': { max: 6, unit: 'lb' },
    'pork': { max: 5, unit: 'lb' },
    'shrimp': { max: 3, unit: 'lb' },
  };

  // Validate and cap quantities
  const warnings: string[] = [];
  const cappedGroceryList = parsed.grocery_list.map(item => {
    const amount = parseFloat(item.amount);
    if (isNaN(amount)) return item;

    const nameLower = item.name.toLowerCase();

    // Check against specific limits
    for (const [ingredient, limit] of Object.entries(maxQuantities)) {
      if (nameLower.includes(ingredient) && amount > limit.max) {
        warnings.push(`Capped ${item.name}: ${amount} → ${limit.max} ${item.unit}`);
        return { ...item, amount: String(limit.max) };
      }
    }

    // General fallback limits for items not in the specific list
    if (item.unit === 'whole' && amount > 20 && !nameLower.includes('egg')) {
      warnings.push(`Capped ${item.name}: ${amount} → 15 whole`);
      return { ...item, amount: '15' };
    }
    if (item.unit === 'lb' && amount > 10) {
      warnings.push(`Capped ${item.name}: ${amount} → 8 lb`);
      return { ...item, amount: '8' };
    }

    return item;
  });

  if (warnings.length > 0) {
    console.warn('Grocery list quantities capped:', warnings);
    // Log to database for monitoring
    await logLLMCall({
      user_id: userId,
      prompt: 'QUANTITY_CAPPED',
      output: warnings.join('; '),
      model: 'validation',
      prompt_type: 'grocery_list_validation',
    });
  }

  return cappedGroceryList;
}

/**
 * Progress callback type for streaming updates
 */
export type ProgressCallback = (stage: string, message: string) => void;

/**
 * Helper function to organize meals into day plans
 */
function organizeMealsIntoDays(mealsResult: { meals: Array<MealWithIngredientNutrition & { day: DayOfWeek }> }): DayPlan[] {
  const mealsByDay = new Map<DayOfWeek, Meal[]>();
  for (const day of DAYS) {
    mealsByDay.set(day, []);
  }

  for (const meal of mealsResult.meals) {
    const dayMeals = mealsByDay.get(meal.day as DayOfWeek) || [];
    dayMeals.push({
      name: meal.name,
      type: meal.type,
      prep_time_minutes: meal.prep_time_minutes,
      ingredients: meal.ingredients,
      instructions: meal.instructions,
      macros: meal.macros,
    });
    mealsByDay.set(meal.day as DayOfWeek, dayMeals);
  }

  // Build day plans with totals
  return DAYS.map(day => {
    const meals = mealsByDay.get(day) || [];
    const daily_totals: Macros = meals.reduce(
      (totals, meal) => ({
        calories: totals.calories + meal.macros.calories,
        protein: totals.protein + meal.macros.protein,
        carbs: totals.carbs + meal.macros.carbs,
        fat: totals.fat + meal.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return { day, meals, daily_totals };
  });
}

/**
 * Main two-stage meal plan generation function
 * Orchestrates all three stages and returns a complete meal plan with prep sessions
 */
export async function generateMealPlanTwoStage(
  profile: UserProfile,
  userId: string,
  recentMealNames?: string[],
  mealPreferences?: { liked: string[]; disliked: string[] },
  validatedMeals?: ValidatedMealMacros[],
  ingredientPreferences?: { liked: string[]; disliked: string[] }
): Promise<{
  days: DayPlan[];
  grocery_list: Ingredient[];
  core_ingredients: CoreIngredients;
  prep_sessions: PrepModeResponse;
}> {
  // Use the progress version with a no-op callback
  return generateMealPlanWithProgress(
    profile,
    userId,
    recentMealNames,
    mealPreferences,
    validatedMeals,
    ingredientPreferences,
    () => {} // No-op progress callback
  );
}

/**
 * Main two-stage meal plan generation function WITH progress callbacks
 * Orchestrates all stages with streaming progress updates
 * Parallelizes grocery list and prep sessions for better performance
 */
export async function generateMealPlanWithProgress(
  profile: UserProfile,
  userId: string,
  recentMealNames?: string[],
  mealPreferences?: { liked: string[]; disliked: string[] },
  validatedMeals?: ValidatedMealMacros[],
  ingredientPreferences?: { liked: string[]; disliked: string[] },
  onProgress?: ProgressCallback
): Promise<{
  days: DayPlan[];
  grocery_list: Ingredient[];
  core_ingredients: CoreIngredients;
  prep_sessions: PrepModeResponse;
}> {
  const progress = onProgress || (() => {});

  // Stage 1: Generate core ingredients
  progress('ingredients', 'Selecting ingredients based on your macros...');
  const coreIngredients = await generateCoreIngredients(
    profile,
    userId,
    recentMealNames,
    mealPreferences,
    ingredientPreferences
  );
  progress('ingredients_done', 'Ingredients selected!');

  // Stage 2: Generate meals from core ingredients
  progress('meals', 'Creating your 7-day meal plan...');
  const mealsResult = await generateMealsFromCoreIngredients(
    profile,
    coreIngredients,
    userId,
    mealPreferences,
    validatedMeals
  );
  progress('meals_done', 'Meals created!');

  // Organize meals into day plans
  const days = organizeMealsIntoDays(mealsResult);

  // Stage 3: Generate grocery list AND prep sessions IN PARALLEL
  // This is a key performance optimization - these two tasks are independent
  progress('finalizing', 'Building grocery list and prep schedule...');

  const [grocery_list, prep_sessions] = await Promise.all([
    generateGroceryListFromCoreIngredients(coreIngredients, days, userId, profile),
    generatePrepSessions(days, coreIngredients, profile, userId),
  ]);

  progress('finalizing_done', 'Almost done!');

  return {
    days,
    grocery_list,
    core_ingredients: coreIngredients,
    prep_sessions,
  };
}

/**
 * Generate prep sessions for an existing meal plan
 * Can be called separately if prep mode wasn't generated initially
 */
export async function generatePrepModeForExistingPlan(
  mealPlanId: string,
  userId: string
): Promise<PrepModeResponse> {
  const supabase = await createClient();

  // Fetch the meal plan
  const { data: mealPlan, error } = await supabase
    .from('meal_plans')
    .select('plan_data, core_ingredients')
    .eq('id', mealPlanId)
    .eq('user_id', userId)
    .single();

  if (error || !mealPlan) {
    throw new Error('Meal plan not found');
  }

  // Fetch user profile for prep preferences
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!profile) {
    throw new Error('User profile not found');
  }

  const days = mealPlan.plan_data as DayPlan[];
  const coreIngredients = mealPlan.core_ingredients as CoreIngredients | null;

  // If no core ingredients stored, extract from meal plan
  const ingredients: CoreIngredients = coreIngredients || {
    proteins: [],
    vegetables: [],
    fruits: [],
    grains: [],
    fats: [],
    pantry: [],
  };

  return generatePrepSessions(days, ingredients, profile as UserProfile, userId);
}
