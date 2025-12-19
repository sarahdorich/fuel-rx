import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMealPlanTwoStage } from '@/lib/claude'
import type { UserProfile, IngredientCategory } from '@/lib/types'
import { DEFAULT_INGREDIENT_VARIETY_PREFS } from '@/lib/types'

export async function POST() {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Query the user's most recent meal plan to avoid repeating meals
  const { data: recentPlan } = await supabase
    .from('meal_plans')
    .select('plan_data')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Extract meal names from the recent plan (if exists)
  let recentMealNames: string[] = []
  if (recentPlan?.plan_data) {
    const planData = recentPlan.plan_data as { day: string; meals: { name: string }[] }[]
    recentMealNames = planData.flatMap(day => day.meals.map(meal => meal.name))
  }

  // Fetch user's meal preferences (likes/dislikes)
  const { data: mealPrefsData } = await supabase
    .from('meal_preferences')
    .select('meal_name, preference')
    .eq('user_id', user.id)

  const mealPreferences = {
    liked: mealPrefsData?.filter(p => p.preference === 'liked').map(p => p.meal_name) || [],
    disliked: mealPrefsData?.filter(p => p.preference === 'disliked').map(p => p.meal_name) || [],
  }

  // Fetch user's validated meals (user-corrected calorie/macro data)
  const { data: validatedMealsData } = await supabase
    .from('validated_meals_by_user')
    .select('meal_name, calories, protein, carbs, fat')
    .eq('user_id', user.id)

  const validatedMeals = validatedMealsData?.map(m => ({
    meal_name: m.meal_name,
    calories: m.calories,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
  })) || []

  try {
    // Ensure profile has ingredient_variety_prefs (use defaults if not set)
    const profileWithDefaults = {
      ...profile,
      ingredient_variety_prefs: profile.ingredient_variety_prefs || DEFAULT_INGREDIENT_VARIETY_PREFS,
    } as UserProfile

    // Generate meal plan using two-stage generation
    const mealPlanData = await generateMealPlanTwoStage(
      profileWithDefaults,
      user.id,
      recentMealNames,
      mealPreferences,
      validatedMeals
    )

    // Calculate week start date (next Monday)
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() + daysUntilMonday)
    const weekStartDate = weekStart.toISOString().split('T')[0]

    // Save meal plan to database with core ingredients
    const { data: savedPlan, error: saveError } = await supabase
      .from('meal_plans')
      .insert({
        user_id: user.id,
        week_start_date: weekStartDate,
        plan_data: mealPlanData.days,
        grocery_list: mealPlanData.grocery_list,
        core_ingredients: mealPlanData.core_ingredients,
        is_favorite: false,
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving meal plan:', saveError)
      return NextResponse.json({ error: 'Failed to save meal plan' }, { status: 500 })
    }

    // Save core ingredients to meal_plan_ingredients table for easier querying
    const ingredientInserts = Object.entries(mealPlanData.core_ingredients).flatMap(
      ([category, ingredients]) =>
        (ingredients as string[]).map(ingredientName => ({
          meal_plan_id: savedPlan.id,
          category: category as IngredientCategory,
          ingredient_name: ingredientName,
        }))
    )

    if (ingredientInserts.length > 0) {
      const { error: ingredientsError } = await supabase
        .from('meal_plan_ingredients')
        .insert(ingredientInserts)

      if (ingredientsError) {
        console.error('Error saving meal plan ingredients:', ingredientsError)
        // Don't fail the request, just log the error
      }
    }

    // Save prep sessions
    const prepSessionInserts = mealPlanData.prep_sessions.prepSessions.map(session => ({
      meal_plan_id: savedPlan.id,
      session_name: session.sessionName,
      session_order: session.sessionOrder,
      estimated_minutes: session.estimatedMinutes,
      prep_items: session.prepItems,
      feeds_meals: session.prepItems.flatMap(item => item.feeds),
      instructions: session.instructions,
      daily_assembly: mealPlanData.prep_sessions.dailyAssembly,
    }))

    if (prepSessionInserts.length > 0) {
      const { error: prepError } = await supabase
        .from('prep_sessions')
        .insert(prepSessionInserts)

      if (prepError) {
        console.error('Error saving prep sessions:', prepError)
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({
      id: savedPlan.id,
      week_start_date: savedPlan.week_start_date,
      days: mealPlanData.days,
      grocery_list: mealPlanData.grocery_list,
      core_ingredients: mealPlanData.core_ingredients,
      prep_sessions: mealPlanData.prep_sessions,
    })
  } catch (error) {
    console.error('Error generating meal plan:', error)
    return NextResponse.json(
      { error: 'Failed to generate meal plan' },
      { status: 500 }
    )
  }
}
