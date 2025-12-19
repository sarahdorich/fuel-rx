import Anthropic from '@anthropic-ai/sdk';
import type {
  UserProfile,
  DayPlan,
  Ingredient,
  MealConsistencyPrefs,
  MealType,
  Meal,
  Macros,
  CoreIngredients,
  IngredientVarietyPrefs,
  PrepItem,
  DailyAssembly,
  PrepModeResponse,
  DayOfWeek,
} from './types';
import { DEFAULT_MEAL_CONSISTENCY_PREFS, DEFAULT_INGREDIENT_VARIETY_PREFS } from './types';
import { createClient } from './supabase/server';

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
 * Stage 1: Generate core ingredients for the week
 * Selects a focused set of ingredients based on user preferences
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

  const prompt = `You are a meal planning assistant for CrossFit athletes. Your job is to select a focused set of core ingredients for one week of meals.
${exclusionsSection}${preferencesSection}
## USER CONTEXT
- Daily Macros: ${profile.target_calories} calories, ${profile.target_protein}g protein, ${profile.target_carbs}g carbs, ${profile.target_fat}g fat
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

## INSTRUCTIONS
Select ingredients that:
1. Are versatile and can be prepared multiple ways
2. Are commonly available at grocery stores
3. Work well for batch cooking
4. Can create variety through different cooking methods
5. Are appropriate for CrossFit athletes (nutrient-dense, support recovery)
6. Match the user's dietary preferences

## INGREDIENT SELECTION GUIDELINES
- **Proteins**: Focus on lean, versatile options like chicken breast, ground beef (90% lean), salmon, eggs, Greek yogurt
- **Vegetables**: Mix of colors and nutrients - cruciferous (broccoli, cauliflower), leafy greens (spinach, kale), starchy (sweet potatoes), and colorful (bell peppers, tomatoes)
- **Fruits**: Fresh fruits that support recovery and provide natural energy
- **Grains/Starches**: Whole grains like quinoa, brown rice, oats, or starchy vegetables
- **Healthy Fats**: Avocado, olive oil, nuts, nut butters, seeds
- **Pantry Staples**: Eggs (if not listed as protein), Greek yogurt, canned beans, cottage cheese, etc.

## CONSTRAINTS
- Select EXACTLY the number of items requested per category
- Prioritize ingredients that can be used in multiple meals
- Consider shelf life and storage
- Think about what can be bought in bulk
- ONLY recommend healthy, whole foods that are non-processed or minimally processed

Return ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "proteins": ["Chicken breast", "Ground beef", "Salmon"],
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
 * Creates 21 meals constrained to the selected ingredients
 */
async function generateMealsFromCoreIngredients(
  profile: UserProfile,
  coreIngredients: CoreIngredients,
  userId: string,
  mealPreferences?: { liked: string[]; disliked: string[] },
  validatedMeals?: ValidatedMealMacros[]
): Promise<{ meals: Array<Meal & { day: DayOfWeek }> }> {
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

  // Determine meal types needed
  const mealTypesNeeded = getMealTypesForPlan(profile.meals_per_day);
  const uniqueMealTypes = Array.from(new Set(mealTypesNeeded)) as MealType[];

  // Build consistency instructions
  const consistencyInstructions = uniqueMealTypes.map(type => {
    const isConsistent = mealConsistencyPrefs[type] === 'consistent';
    if (isConsistent) {
      return `- ${type.charAt(0).toUpperCase() + type.slice(1)}: Generate 1 meal (will be eaten all 7 days)`;
    }
    return `- ${type.charAt(0).toUpperCase() + type.slice(1)}: Generate 7 different meals (one per day)`;
  }).join('\n');

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

  const prompt = `You are generating a 7-day meal plan for a CrossFit athlete.

**CRITICAL CONSTRAINT**: You MUST use ONLY the ingredients provided below. Do NOT add any new ingredients.
${preferencesSection}${validatedMealsSection}
## CORE INGREDIENTS (USE ONLY THESE)
${ingredientsJSON}

## USER MACROS (daily targets)
- Calories: ${profile.target_calories} kcal
- Protein: ${profile.target_protein}g
- Carbs: ${profile.target_carbs}g
- Fat: ${profile.target_fat}g
- Dietary Preferences: ${dietaryPrefsText}
- Max Prep Time Per Meal: ${profile.prep_time} minutes

## TARGET MACROS PER MEAL (approximately)
- Calories: ~${targetCaloriesPerMeal} kcal
- Protein: ~${targetProteinPerMeal}g
- Carbs: ~${targetCarbsPerMeal}g
- Fat: ~${targetFatPerMeal}g

## MEAL CONSISTENCY SETTINGS
${consistencyInstructions}

## INSTRUCTIONS
1. Create variety through different:
   - Cooking methods (grilled, baked, stir-fried, steamed, raw)
   - Flavor profiles (Mediterranean, Asian, Mexican, Italian, American)
   - Meal structures (bowls, salads, plates, wraps using lettuce)
2. Design meals that work well for batch cooking
   - Many meals can share the same base protein cooked once
   - Example: Grilled chicken used in 4 different meals with different preparations
3. Balance macros across each day
4. Make meals practical and appealing
5. Consider meal prep efficiency

## CRITICAL RULES
- Use ONLY the provided ingredients (you may use basic seasonings like salt, pepper, garlic, onion, herbs, and spices)
- Do NOT introduce new proteins, vegetables, fruits, grains, fats, or pantry items beyond what's listed
- Create variety through preparation methods, not new ingredients
- Verify that calories approximately = (protein × 4) + (carbs × 4) + (fat × 9)

## RESPONSE FORMAT
Return ONLY valid JSON with this exact structure:
{
  "meals": [
    {
      "day": "monday",
      "type": "breakfast",
      "name": "Greek Yogurt Power Bowl",
      "ingredients": [
        {"name": "Greek yogurt", "amount": "1", "unit": "cup", "category": "dairy"},
        {"name": "Berries", "amount": "0.5", "unit": "cup", "category": "produce"},
        {"name": "Almonds", "amount": "1", "unit": "oz", "category": "pantry"}
      ],
      "instructions": ["Add yogurt to bowl", "Top with berries and almonds"],
      "prep_time_minutes": 5,
      "macros": {
        "calories": 350,
        "protein": 25,
        "carbs": 35,
        "fat": 12
      }
    }
  ]
}

Generate all meals for all 7 days in a single "meals" array. Order by day (monday first), then by meal type (breakfast, lunch, dinner, snack).`;

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

/**
 * Stage 3: Analyze meals and generate prep sessions
 * Creates batch cooking strategies for efficient meal prep
 */
async function generatePrepSessions(
  days: DayPlan[],
  coreIngredients: CoreIngredients,
  profile: UserProfile,
  userId: string
): Promise<PrepModeResponse> {
  // Build a summary of the meal plan
  const mealSummary = days.map(day => {
    const mealsList = day.meals.map(m =>
      `  - ${m.type}: ${m.name} (${m.macros.protein}g protein)`
    ).join('\n');
    return `${day.day.charAt(0).toUpperCase() + day.day.slice(1)}:\n${mealsList}`;
  }).join('\n\n');

  // Map prep_time to complexity description
  let prepStyle = 'moderate batch cooking';
  if (profile.prep_time <= 15) prepStyle = 'minimal cooking, mostly assembly';
  else if (profile.prep_time >= 45) prepStyle = 'extensive batch cooking with multiple components';

  const prompt = `You are analyzing a week of meals to create an efficient batch cooking strategy for a CrossFit athlete.

## MEAL PLAN
${mealSummary}

## CORE INGREDIENTS USED
${JSON.stringify(coreIngredients, null, 2)}

## USER PREFERENCES
- Prep style: ${prepStyle} (${profile.prep_time} min max per meal)
- Meals per day: ${profile.meals_per_day}

## INSTRUCTIONS
Analyze the meal plan and create 1-3 prep sessions that:
1. Group similar cooking tasks together (all grilling, all roasting, etc.)
2. Identify which proteins, grains, and vegetables can be batch cooked
3. Show which meals each prep item feeds
4. Estimate realistic cooking times
5. Provide storage instructions
6. Optimize for efficiency (what can cook simultaneously)

## TYPICAL STRUCTURE
- **Sunday Prep Session** (1.5-2.5 hours): Major batch cooking
- **Optional Wednesday Mini-Prep** (30-45 min): Mid-week refresh if needed
- **Daily Assembly** (5-10 min per meal): Heating and plating only

For each prep item, specify:
- What to cook/prep
- How much (quantity)
- Basic cooking method
- Which meals it feeds (by day and meal type)
- Storage instructions

Also provide a "Daily Assembly" guide showing how to quickly put together each meal using prepped components.

## RESPONSE FORMAT
Return ONLY valid JSON:
{
  "prepSessions": [
    {
      "sessionName": "Sunday Prep Session",
      "sessionOrder": 1,
      "estimatedMinutes": 120,
      "instructions": "Start with the chicken on the grill while vegetables roast in the oven. While those cook, prepare quinoa on the stovetop.",
      "prepItems": [
        {
          "item": "Grill chicken breast",
          "quantity": "4 lbs (about 8 breasts)",
          "method": "Grill over medium-high heat, 6-7 min per side",
          "storage": "Refrigerate in airtight container up to 4 days",
          "feeds": [
            {"day": "monday", "meal": "dinner"},
            {"day": "tuesday", "meal": "lunch"},
            {"day": "wednesday", "meal": "lunch"},
            {"day": "friday", "meal": "dinner"}
          ]
        }
      ]
    }
  ],
  "dailyAssembly": {
    "monday": {
      "breakfast": {"time": "2 min", "instructions": "Assemble Greek yogurt bowl with berries and almonds"},
      "lunch": {"time": "3 min", "instructions": "Heat ground beef, assemble bowl"},
      "dinner": {"time": "5 min", "instructions": "Plate grilled chicken, reheat veggies and quinoa"}
    }
  }
}`;

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

  const parsed: PrepModeResponse = JSON.parse(jsonText);
  return parsed;
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
