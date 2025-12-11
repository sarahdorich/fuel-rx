import Anthropic from '@anthropic-ai/sdk';
import type { UserProfile, DayPlan, Ingredient, DIETARY_PREFERENCE_LABELS } from './types';

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

export async function generateMealPlan(profile: UserProfile): Promise<{
  days: DayPlan[];
  grocery_list: Ingredient[];
}> {
  const dietaryPrefs = profile.dietary_prefs ?? ['no_restrictions'];
  const dietaryPrefsText = dietaryPrefs
    .map(pref => DIETARY_LABELS[pref] || pref)
    .join(', ') || 'No restrictions';

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
6. Include variety across the week - avoid repeating the same meals

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
The grocery list should consolidate all ingredients across the week with combined quantities.`;

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
