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
  IngredientNutrition,
  PrepStyle,
  MealComplexity,
  PrepTask,
  PrepSessionType,
} from './types';
import { DEFAULT_MEAL_CONSISTENCY_PREFS, DEFAULT_INGREDIENT_VARIETY_PREFS, MEAL_COMPLEXITY_LABELS } from './types';
import { createClient } from './supabase/server';

// ============================================
// Ingredient Nutrition Cache Functions
// ============================================

/**
 * Fetch cached nutrition data for ingredients
 * Returns a map of normalized ingredient names to nutrition data
 */
async function fetchCachedNutrition(ingredientNames: string[]): Promise<Map<string, IngredientNutrition>> {
  const supabase = await createClient();
  const normalizedNames = ingredientNames.map(name => name.toLowerCase().trim());

  const { data, error } = await supabase
    .from('ingredient_nutrition')
    .select('*')
    .in('name_normalized', normalizedNames);

  if (error) {
    console.error('Error fetching cached nutrition:', error);
    return new Map();
  }

  const nutritionMap = new Map<string, IngredientNutrition>();
  for (const item of data || []) {
    nutritionMap.set(item.name_normalized, item as IngredientNutrition);
  }

  return nutritionMap;
}

/**
 * Cache new nutrition data for ingredients
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
  }>
): Promise<void> {
  const supabase = await createClient();

  const inserts = ingredients.map(ing => ({
    name: ing.name,
    name_normalized: ing.name.toLowerCase().trim(),
    serving_size: ing.serving_size,
    serving_unit: ing.serving_unit,
    calories: ing.calories,
    protein: ing.protein,
    carbs: ing.carbs,
    fat: ing.fat,
    source: 'llm_estimated' as const,
    confidence_score: 0.7,
  }));

  // Use upsert to avoid duplicates
  const { error } = await supabase
    .from('ingredient_nutrition')
    .upsert(inserts, {
      onConflict: 'name_normalized,serving_size,serving_unit',
      ignoreDuplicates: true,
    });

  if (error) {
    console.error('Error caching ingredient nutrition:', error);
  }
}

/**
 * Build a nutrition reference string from cached data for LLM prompts
 */
function buildNutritionReferenceSection(nutritionCache: Map<string, IngredientNutrition>): string {
  if (nutritionCache.size === 0) return '';

  const lines = Array.from(nutritionCache.values()).map(n =>
    `- ${n.name}: ${n.calories} cal, ${n.protein}g protein, ${n.carbs}g carbs, ${n.fat}g fat per ${n.serving_size} ${n.serving_unit}`
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

  const recentMealsExclusion = recentMealNames && recentMealNames.length > 0
    ? `\n## IMPORTANT: Meal Variety Requirement\nAVOID these recently used meals from the user's last meal plan: ${recentMealNames.join(', ')}. Create entirely new and different meals to provide variety.\n`
    : '';

  let mealPreferencesSection = '';
  if (mealPreferences) {
    const parts: string[] = [];
    if (mealPreferences.liked.length > 0) {
      parts.push(`**Meals the user LIKES** (try to include similar meals or these exact meals): ${mealPreferences.liked.join(', ')}`);
    }
    if (mealPreferences.disliked.length > 0) {
      parts.push(`**Meals the user DISLIKES** (AVOID these meals and similar ones): ${mealPreferences.disliked.join(', ')}`);
    }
    if (parts.length > 0) {
      mealPreferencesSection = `\n## User Meal Preferences\n${parts.join('\n')}\n`;
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
${recentMealsExclusion}${mealPreferencesSection}${validatedMealsSection}
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
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed: MealTypeResult = JSON.parse(jsonText);
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
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed: { grocery_list: Ingredient[] } = JSON.parse(jsonText);
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
  mealPreferences?: { liked: string[]; disliked: string[] }
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

  let exclusionsSection = '';
  if (recentMealNames && recentMealNames.length > 0) {
    exclusionsSection = `\n## Avoid Recently Used Meals\nThe user recently had these meals, so try to select ingredients that enable DIFFERENT meals: ${recentMealNames.slice(0, 10).join(', ')}\n`;
  }

  let preferencesSection = '';
  if (mealPreferences) {
    const parts: string[] = [];
    if (mealPreferences.liked.length > 0) {
      parts.push(`The user LIKES meals like: ${mealPreferences.liked.join(', ')} - consider ingredients that work for similar meals`);
    }
    if (mealPreferences.disliked.length > 0) {
      parts.push(`The user DISLIKES: ${mealPreferences.disliked.join(', ')} - avoid ingredients strongly associated with these`);
    }
    if (parts.length > 0) {
      preferencesSection = `\n## User Preferences\n${parts.join('\n')}\n`;
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
${exclusionsSection}${preferencesSection}
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
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed: CoreIngredients = JSON.parse(jsonText);
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

  const prompt = `You are generating a 7-day meal plan for a CrossFit athlete.

**CRITICAL CONSTRAINT**: You MUST use ONLY the ingredients provided below. Do NOT add any new ingredients.
${preferencesSection}${validatedMealsSection}
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
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed = JSON.parse(jsonText);
  return parsed;
}

// New prep sessions response type for the collapsible prep view
interface NewPrepSessionsResponse {
  prep_sessions: Array<{
    session_name: string;
    session_type: PrepSessionType;
    session_day: DayOfWeek | null;
    session_time_of_day: 'morning' | 'afternoon' | 'night' | null;
    prep_for_date: string | null;
    estimated_minutes: number;
    prep_tasks: PrepTask[];
    display_order: number;
  }>;
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
  days.forEach((day, dayIndex) => {
    day.meals.forEach((meal, mealIndex) => {
      const id = `meal_${day.day}_${meal.type}_${mealIndex}`;
      mealIds[`${day.day}_${meal.type}_${mealIndex}`] = id;
    });
  });

  // Build a summary of the meal plan with IDs
  const mealSummary = days.map(day => {
    const mealsList = day.meals.map((m, idx) =>
      `  - ${m.type} (ID: meal_${day.day}_${m.type}_${idx}): ${m.name} (${m.macros.protein}g protein, prep: ${m.prep_time_minutes}min)`
    ).join('\n');
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

Group all batch cooking together. Meals with quick_assembly complexity need NO prep tasks.
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
`,
    day_of: `
## PREP STYLE: Day-Of Fresh Cooking
Create multiple sessions per day - one for each meal that requires cooking.
Users want FRESH meals, so create separate sessions for breakfast, lunch, and dinner each day.

For quick_assembly meals (${breakfastComplexity === 'quick_assembly' ? 'breakfast' : ''}${lunchComplexity === 'quick_assembly' ? ', lunch' : ''}${dinnerComplexity === 'quick_assembly' ? ', dinner' : ''}):
These don't need prep sessions - they're just assembly.

For minimal_prep and full_recipe meals: Create individual prep sessions.
Session types: "day_of_morning" for breakfast, "day_of_dinner" for dinner.
`,
    mixed: `
## PREP STYLE: Mixed/Flexible
This is the most common choice. Create a balanced prep schedule:

1. **Weekly Batch Prep** (optional, if helpful): Batch cook proteins that appear in multiple meals
2. **Night Before** sessions for meals that benefit from advance prep
3. **Day-Of** sessions for full_recipe dinners that users want fresh

COMPLEXITY-BASED LOGIC:
- quick_assembly meals (${breakfastComplexity === 'quick_assembly' ? 'breakfast, ' : ''}${lunchComplexity === 'quick_assembly' ? 'lunch, ' : ''}${dinnerComplexity === 'quick_assembly' ? 'dinner' : ''}): NO prep sessions needed
- minimal_prep meals: Can be prepped night before OR batched if similar across days
- full_recipe meals: Prep night before for components, or cook day-of for freshness

For this user:
- Breakfast: ${breakfastComplexity} → ${breakfastComplexity === 'quick_assembly' ? 'No prep needed' : breakfastComplexity === 'minimal_prep' ? 'Quick night-before prep or batch' : 'May need dedicated prep'}
- Lunch: ${lunchComplexity} → ${lunchComplexity === 'quick_assembly' ? 'No prep needed' : lunchComplexity === 'minimal_prep' ? 'Quick night-before prep or batch' : 'May need dedicated prep'}
- Dinner: ${dinnerComplexity} → ${dinnerComplexity === 'quick_assembly' ? 'No prep needed' : dinnerComplexity === 'minimal_prep' ? 'Quick night-before prep' : 'Night-before prep or day-of cooking'}
`,
  };

  const prompt = `You are creating a prep schedule for a CrossFit athlete's weekly meal plan.

## MEAL PLAN (with meal IDs for reference)
${mealSummary}

## CORE INGREDIENTS
${JSON.stringify(coreIngredients, null, 2)}

## WEEK DATES
${JSON.stringify(dayDates, null, 2)}

${prepStyleInstructions[prepStyle as PrepStyle]}

## INSTRUCTIONS
Generate prep sessions based on the prep style above. Each session should have:
1. A clear, descriptive name (e.g., "Sunday Batch Prep", "Monday Night (for Tuesday)", "Wednesday Dinner Prep")
2. Appropriate session_type: "weekly_batch", "night_before", "day_of_morning", or "day_of_dinner"
3. session_day: the day the prep happens (lowercase)
4. session_time_of_day: "morning", "afternoon", or "night" (null for weekly_batch)
5. prep_for_date: ISO date string for the day the meals are eaten (null for weekly_batch)
6. Realistic time estimates
7. Individual prep_tasks with:
   - Unique IDs (e.g., "task_1", "task_batch_chicken")
   - Clear descriptions of what to do
   - Which meal_ids this task supports
   - Time estimate per task

## TASK GROUPING RULES
- Batch similar tasks (all grilling, all chopping, etc.)
- For weekly_batch: group proteins and grains that appear in multiple meals
- For night_before: group all prep for the next day's meals
- For day_of: include only cooking tasks for that specific meal
- quick_assembly meals should NOT have prep tasks (they're just assembly)

## RESPONSE FORMAT
Return ONLY valid JSON:
{
  "prep_sessions": [
    {
      "session_name": "Weekly Batch Prep (Optional)",
      "session_type": "weekly_batch",
      "session_day": null,
      "session_time_of_day": null,
      "prep_for_date": null,
      "estimated_minutes": 45,
      "prep_tasks": [
        {
          "id": "task_batch_chicken",
          "description": "Grill 6 chicken breasts for the week's lunches",
          "estimated_minutes": 25,
          "meal_ids": ["meal_monday_lunch_0", "meal_tuesday_lunch_0", "meal_wednesday_lunch_0"],
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
      "estimated_minutes": 30,
      "prep_tasks": [
        {
          "id": "task_mon_dinner_1",
          "description": "Bake salmon with lemon and herbs",
          "estimated_minutes": 20,
          "meal_ids": ["meal_monday_dinner_0"],
          "completed": false
        }
      ],
      "display_order": 2
    }
  ]
}

IMPORTANT:
- Every meal_id in prep_tasks MUST match the format "meal_[day]_[type]_[index]" from the meal plan above
- Order sessions by display_order (weekly batch first if present, then chronologically)
- Keep session count reasonable: 3-10 for mixed, 1-2 for traditional_batch, 7 for night_before, up to 21 for day_of`;

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
    prompt_type: 'prep_mode_analysis',
    tokens_used: message.usage?.output_tokens,
    duration_ms: duration,
  });

  // Parse the JSON response
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed: NewPrepSessionsResponse = JSON.parse(jsonText);

  // Convert new format to PrepModeResponse format for backward compatibility
  // The new format includes prep_tasks, the old format uses prepItems
  const prepModeResponse: PrepModeResponse = {
    prepSessions: parsed.prep_sessions.map(session => ({
      sessionName: session.session_name,
      sessionOrder: session.display_order,
      estimatedMinutes: session.estimated_minutes,
      instructions: `${session.session_type} session${session.session_day ? ` on ${session.session_day}` : ''}`,
      prepItems: session.prep_tasks.map(task => ({
        item: task.description,
        quantity: '',
        method: '',
        storage: '',
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
      // Store new fields for the UI
      sessionType: session.session_type,
      sessionDay: session.session_day,
      sessionTimeOfDay: session.session_time_of_day,
      prepForDate: session.prep_for_date,
      prepTasks: session.prep_tasks,
      displayOrder: session.display_order,
    })),
    dailyAssembly: {}, // Will be populated separately if needed
  };

  // Store the raw new format for the new prep view UI
  (prepModeResponse as PrepModeResponse & { newPrepSessions: NewPrepSessionsResponse['prep_sessions'] }).newPrepSessions = parsed.prep_sessions;

  return prepModeResponse;
}

/**
 * Generate grocery list from core ingredients
 * Converts core ingredients to practical shopping quantities
 */
async function generateGroceryListFromCoreIngredients(
  coreIngredients: CoreIngredients,
  days: DayPlan[],
  userId: string
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

  const prompt = `You are creating a practical grocery shopping list from a meal plan's core ingredients.

## CORE INGREDIENTS
${JSON.stringify(coreIngredients, null, 2)}

## INGREDIENT USAGE IN MEALS
${usageSummary}

## INSTRUCTIONS
Convert these core ingredients into a practical grocery shopping list with realistic quantities based on how they're used in the meals.

Use practical shopping quantities:
- Use "whole" or count for items bought individually (e.g., "3" avocados)
- Use "lb" or "oz" for meats and proteins
- Use "bag" for items typically sold in bags
- Use "bunch" for herbs and leafy greens
- Use "container" or "package" for yogurt, tofu, etc.
- Round up to ensure enough for all meals

## RESPONSE FORMAT
Return ONLY valid JSON:
{
  "grocery_list": [
    {"name": "Chicken breast", "amount": "4", "unit": "lb", "category": "protein"},
    {"name": "Broccoli", "amount": "2", "unit": "lb", "category": "produce"},
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

  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed: { grocery_list: Ingredient[] } = JSON.parse(jsonText);
  return parsed.grocery_list;
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
  validatedMeals?: ValidatedMealMacros[]
): Promise<{
  days: DayPlan[];
  grocery_list: Ingredient[];
  core_ingredients: CoreIngredients;
  prep_sessions: PrepModeResponse;
}> {
  // Stage 1: Generate core ingredients
  const coreIngredients = await generateCoreIngredients(
    profile,
    userId,
    recentMealNames,
    mealPreferences
  );

  // Stage 2: Generate meals from core ingredients
  const mealsResult = await generateMealsFromCoreIngredients(
    profile,
    coreIngredients,
    userId,
    mealPreferences,
    validatedMeals
  );

  // Organize meals into day plans
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
  const days: DayPlan[] = DAYS.map(day => {
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

  // Generate grocery list from core ingredients
  const grocery_list = await generateGroceryListFromCoreIngredients(
    coreIngredients,
    days,
    userId
  );

  // Stage 3: Generate prep sessions
  const prep_sessions = await generatePrepSessions(
    days,
    coreIngredients,
    profile,
    userId
  );

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
