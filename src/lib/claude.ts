import Anthropic from '@anthropic-ai/sdk';
import type { UserProfile, DayPlan, Ingredient, MealConsistencyPrefs, MealType } from './types';
import { DEFAULT_MEAL_CONSISTENCY_PREFS } from './types';

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

function buildConsistencyInstructions(prefs: MealConsistencyPrefs): string {
  const consistentMeals: string[] = [];
  const variedMeals: string[] = [];

  const mealTypeLabels: Record<MealType, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
  };

  for (const [mealType, consistency] of Object.entries(prefs) as [MealType, string][]) {
    if (consistency === 'consistent') {
      consistentMeals.push(mealTypeLabels[mealType]);
    } else {
      variedMeals.push(mealTypeLabels[mealType]);
    }
  }

  if (consistentMeals.length === 0) {
    return '7. All meals should be varied - generate different meals each day for maximum variety.';
  }

  let instructions = '';
  if (consistentMeals.length > 0) {
    instructions += `7. **CONSISTENT MEALS**: For ${consistentMeals.join(', ')}, generate ONE meal recipe that will be repeated for ALL 7 days. The exact same meal name, ingredients, instructions, and macros should appear on each day.\n`;
  }
  if (variedMeals.length > 0) {
    instructions += `8. **VARIED MEALS**: For ${variedMeals.join(', ')}, generate DIFFERENT meals each day for variety.`;
  }

  return instructions;
}

export async function generateMealPlan(profile: UserProfile): Promise<{
  days: DayPlan[];
  grocery_list: Ingredient[];
}> {
  const dietaryPrefs = profile.dietary_prefs ?? ['no_restrictions'];
  const dietaryPrefsText = dietaryPrefs
    .map(pref => DIETARY_LABELS[pref] || pref)
    .join(', ') || 'No restrictions';

  const mealConsistencyPrefs = profile.meal_consistency_prefs ?? DEFAULT_MEAL_CONSISTENCY_PREFS;
  const consistencyInstructions = buildConsistencyInstructions(mealConsistencyPrefs);

  const prompt = `You are a nutrition expert specializing in meal planning for CrossFit athletes. Generate a complete 7-day meal plan based on the following requirements:

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
4. Each day's meals should hit the macro targets as closely as possible (within 5% variance)
5. Recipes must be practical and achievable within the specified prep time
6. IMPORTANT - Meal consistency preferences:
${consistencyInstructions}

## Response Format
Return ONLY valid JSON with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "days": [
    {
      "day": "monday",
      "meals": [
        {
          "name": "Meal name",
          "type": "breakfast|lunch|dinner|snack",
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
      ],
      "daily_totals": {
        "calories": 2000,
        "protein": 150,
        "carbs": 200,
        "fat": 70
      }
    }
  ],
  "grocery_list": [
    {
      "name": "ingredient name",
      "amount": "4",
      "unit": "lbs",
      "category": "protein"
    }
  ]
}

Generate the complete 7-day meal plan now. Days should be: monday, tuesday, wednesday, thursday, friday, saturday, sunday.
Meal types should be distributed appropriately based on ${profile.meals_per_day} meals per day (e.g., for 3 meals: breakfast, lunch, dinner; for 4+ meals: include snacks).

## Grocery List Guidelines
- Consolidate all ingredients across the week with combined quantities
- For consistent meals that repeat all 7 days, multiply ingredient quantities by 7 and add "(x7)" to the name to indicate it's for all 7 days
- Example: if a consistent breakfast uses 2 eggs daily, list "Eggs (x7)" with amount "14"
- Group similar ingredients and combine quantities appropriately`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Parse the JSON response - strip markdown code blocks if present
  try {
    let jsonText = responseText.trim();

    // Remove markdown code blocks if Claude wrapped the response
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonText);
    return {
      days: parsed.days,
      grocery_list: parsed.grocery_list,
    };
  } catch (error) {
    console.error('Failed to parse Claude response:', responseText);
    throw new Error('Failed to parse meal plan response');
  }
}
