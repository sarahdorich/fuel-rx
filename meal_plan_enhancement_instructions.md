# FuelRx Meal Plan Enhancement - Implementation Guide

## Context
FuelRx is a Next.js app that generates AI-powered meal plans for CrossFit athletes. Currently, meal plans tend to repeat and the calorie/macro calculations are inaccurate. We need to implement two improvements:

1. **Recent Meal Exclusion**: Query the user's most recent meal plan and pass meal names to avoid repetition
2. **USDA API Integration**: Validate and adjust nutritional data using the USDA FoodData Central API to ensure daily totals are within 5% of user targets

## Current Architecture

### Key Files
- `/src/lib/claude.ts` - Contains `generateMealPlan()` function that calls Claude API
- `/src/app/api/generate-meal-plan/route.ts` - API route that handles meal plan generation
- `/src/lib/types.ts` - TypeScript type definitions
- Database: Supabase with `meal_plans` table storing `plan_data` (JSONB) and `grocery_list`

### Current Flow
```
POST /api/generate-meal-plan 
→ Fetch user profile from Supabase
→ Call generateMealPlan(profile) 
→ Claude generates full JSON meal plan
→ Save to database
→ Return to user
```

## Implementation Requirements

### Task 1: Recent Meal Exclusion

**What to do:**

1. In `/src/app/api/generate-meal-plan/route.ts`, before calling `generateMealPlan()`:
   - Query Supabase for the user's most recent meal plan (ORDER BY created_at DESC LIMIT 1)
   - Extract all meal names from `plan_data.days[].meals[].name`
   - Pass this array to `generateMealPlan()` as a second parameter

2. Update `/src/lib/claude.ts`:
   - Modify `generateMealPlan()` signature to accept optional `recentMealNames: string[]`
   - Add to the prompt: "AVOID these recently used meals: [list]. Create entirely new and different meals."

**Implementation notes:**
- Handle case where user has no previous meal plans (first-time generation)
- Only query the last 1 plan to avoid being too restrictive

### Task 2: USDA FoodData Central API Integration

**Overview:**
After Claude generates the initial meal plan, we need to validate and adjust nutritional data using the free USDA FoodData Central API.

**USDA API Details:**
- Base URL: `https://api.nal.usda.gov/fdc/v1/`
- Endpoint for search: `foods/search?query={food}&api_key={key}`
- Endpoint for food details: `food/{fdcId}?api_key={key}`
- API Key: Register for free at https://fdc.nal.usda.gov/api-key-signup.html
- No rate limits for reasonable use
- Returns: calories, protein, carbs, fat per 100g

**What to do:**

1. Create a new database table for caching USDA ingredient data:
   ```sql
   -- Add to Supabase migrations
   CREATE TABLE usda_ingredients (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     ingredient_name TEXT UNIQUE NOT NULL,
     fdc_id INTEGER NOT NULL,
     calories_per_100g DECIMAL NOT NULL,
     protein_per_100g DECIMAL NOT NULL,
     carbs_per_100g DECIMAL NOT NULL,
     fat_per_100g DECIMAL NOT NULL,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );
   
   -- Index for fast lookups
   CREATE INDEX idx_usda_ingredients_name ON usda_ingredients(ingredient_name);
   ```

2. Create `/src/lib/usda.ts`:
   ```typescript
   // Functions to implement:
   - searchFood(query: string): Promise<USDAFood[]>
   - getFoodDetails(fdcId: number): Promise<NutritionalData>
   - calculateMacros(ingredient: Ingredient): Promise<Macros>
   - getOrFetchIngredient(name: string): Promise<CachedIngredient>
     // This function should:
     // 1. First check if ingredient exists in usda_ingredients table
     // 2. If found, return cached data
     // 3. If not found, call USDA API
     // 4. Store the result in usda_ingredients table
     // 5. Return the data
   ```

3. Create `/src/lib/nutrition-validator.ts`:
   ```typescript
   // Core validation logic:
   async function validateAndAdjustMealPlan(
     plan: MealPlan, 
     profile: UserProfile
   ): Promise<MealPlan>
   ```
   
   **Validation Algorithm:**
   ```
   For each day:
     1. For each meal's ingredients:
        - Check if ingredient exists in usda_ingredients table
        - If not cached, look up ingredient in USDA API and save to database
        - Calculate actual macros based on amount and cached nutritional data
        - Store validated macros
     
     2. Sum all meals to get daily totals
     
     3. Calculate variance from targets:
        variance = (actual - target) / target * 100
     
     4. If variance > 5% for any macro:
        - Adjust portion sizes proportionally
        - Recalculate macros
        - Repeat until within 5% tolerance
     
     5. Update daily_totals with validated numbers
   ```

4. Update `/src/app/api/generate-meal-plan/route.ts`:
   ```typescript
   // After calling generateMealPlan():
   const validatedPlan = await validateAndAdjustMealPlan(
     mealPlanData, 
     profile
   );
   
   // Save validatedPlan instead of raw mealPlanData
   ```

**Important Considerations:**

- **Database Caching**: All USDA API results are cached in the `usda_ingredients` table to avoid repeated lookups. This provides persistent caching across sessions and users.
- **Fuzzy Matching**: USDA database uses scientific names; implement fuzzy string matching (e.g., "chicken breast" → "Chicken, broilers or fryers, breast, meat only, raw"). Consider normalizing ingredient names before lookup.
- **Unit Conversion**: Convert between units (cups → grams, oz → grams) using standard conversion factors
- **Error Handling**: If USDA lookup fails for an ingredient, fall back to Claude's original estimate and log a warning
- **Performance**: Process meals in parallel where possible (Promise.all). Database lookups will be much faster than API calls.
- **Cache Invalidation**: Consider adding an `updated_at` field to refresh stale data (e.g., older than 90 days)

**Example USDA API Response:**
```json
{
  "fdcId": 171705,
  "description": "Chicken, broilers or fryers, breast, meat only, raw",
  "foodNutrients": [
    {"nutrientName": "Energy", "value": 120, "unitName": "KCAL"},
    {"nutrientName": "Protein", "value": 22.5, "unitName": "G"},
    {"nutrientName": "Carbohydrate", "value": 0, "unitName": "G"},
    {"nutrientName": "Total lipid (fat)", "value": 2.6, "unitName": "G"}
  ]
}
```

## Environment Variables

Add to `.env.local`:
```
USDA_API_KEY=your_api_key_here
```

## Testing Strategy

1. Generate a meal plan and verify:
   - No repeated meals from last plan
   - Daily totals within 5% of targets for all macros
   - All ingredients have USDA-validated nutritional data

2. Edge cases to test:
   - First-time user (no previous plans)
   - Unusual ingredients not in USDA database
   - Different dietary preferences (paleo, vegetarian, etc.)

## Success Criteria

- ✅ Meal plans show variety week-to-week
- ✅ Daily calorie totals: target ± 5%
- ✅ Daily protein totals: target ± 5%
- ✅ Daily carb totals: target ± 5%
- ✅ Daily fat totals: target ± 5%
- ✅ Validated nutritional data stored with each meal plan
- ✅ Graceful fallback if USDA API fails

## Additional Notes

- The grocery list consolidation logic may need updating after portion adjustments
- Consider adding a `validated: boolean` field to the `meal_plans` table to track which plans have been USDA-validated
- The `usda_ingredients` table will build up over time, creating a robust cache that speeds up meal plan generation significantly
- Future enhancement: Store USDA `fdcId` with each ingredient in the meal plan for traceability
- Consider adding analytics on cache hit rate to monitor performance improvements

---

## Implementation Order

1. **Create the `usda_ingredients` table in Supabase** - Set up the caching infrastructure first
2. Start with Task 1 (recent meal exclusion) - simpler, immediate value
3. Implement USDA API integration infrastructure with database caching
4. Build validation and adjustment algorithm
5. Integrate into the generation flow
6. Test thoroughly with different user profiles
7. Monitor cache hit rates and optimize fuzzy matching as needed

---

Please implement these features, creating any necessary new files, updating existing ones, and ensuring the code follows TypeScript best practices. Let me know if you need clarification on any part of this specification.
