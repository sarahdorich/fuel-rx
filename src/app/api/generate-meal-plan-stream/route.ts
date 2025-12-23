import { createClient } from '@/lib/supabase/server'
import { generateMealPlanWithProgress } from '@/lib/claude'
import type { UserProfile, IngredientCategory } from '@/lib/types'
import { DEFAULT_INGREDIENT_VARIETY_PREFS } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: 'Profile not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Query the user's last 3 meal plans to avoid repeating meals and provide variety
  const { data: recentPlans } = await supabase
    .from('meal_plans')
    .select('plan_data')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3)

  // Extract meal names from recent plans (if any exist)
  let recentMealNames: string[] = []
  if (recentPlans && recentPlans.length > 0) {
    recentMealNames = recentPlans.flatMap(plan => {
      if (!plan.plan_data) return []
      const planData = plan.plan_data as { day: string; meals: { name: string }[] }[]
      return planData.flatMap(day => day.meals.map(meal => meal.name))
    })
    // Remove duplicates while preserving order
    recentMealNames = [...new Set(recentMealNames)]
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

  // Ensure profile has ingredient_variety_prefs (use defaults if not set)
  const profileWithDefaults = {
    ...profile,
    ingredient_variety_prefs: profile.ingredient_variety_prefs || DEFAULT_INGREDIENT_VARIETY_PREFS,
  } as UserProfile

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Generate meal plan with progress callbacks
        const mealPlanData = await generateMealPlanWithProgress(
          profileWithDefaults,
          user.id,
          recentMealNames,
          mealPreferences,
          validatedMeals,
          (stage, message) => {
            sendEvent('progress', { stage, message })
          }
        )

        // Calculate week start date (next Monday)
        const today = new Date()
        const dayOfWeek = today.getDay()
        const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() + daysUntilMonday)
        const weekStartDate = weekStart.toISOString().split('T')[0]

        sendEvent('progress', { stage: 'saving', message: 'Saving your meal plan...' })

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
          sendEvent('error', { error: 'Failed to save meal plan' })
          controller.close()
          return
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
          }
        }

        // Save prep sessions with new fields for collapsible prep view
        const prepSessionInserts = mealPlanData.prep_sessions.prepSessions.map((session: {
          sessionName: string;
          sessionOrder: number;
          estimatedMinutes: number;
          prepItems: Array<{ feeds: Array<{ day: string; meal: string }> }>;
          instructions: string;
          sessionType?: string;
          sessionDay?: string | null;
          sessionTimeOfDay?: string | null;
          prepForDate?: string | null;
          prepTasks?: Array<{ id: string; description: string; estimated_minutes: number; meal_ids: string[]; completed: boolean }>;
          displayOrder?: number;
        }) => ({
          meal_plan_id: savedPlan.id,
          session_name: session.sessionName,
          session_order: session.sessionOrder,
          estimated_minutes: session.estimatedMinutes,
          prep_items: session.prepItems,
          feeds_meals: session.prepItems.flatMap(item => item.feeds),
          instructions: session.instructions,
          daily_assembly: mealPlanData.prep_sessions.dailyAssembly,
          // New fields for collapsible prep view
          session_type: session.sessionType || 'weekly_batch',
          session_day: session.sessionDay || null,
          session_time_of_day: session.sessionTimeOfDay || null,
          prep_for_date: session.prepForDate || null,
          prep_tasks: session.prepTasks ? { tasks: session.prepTasks } : { tasks: [] },
          display_order: session.displayOrder || session.sessionOrder,
        }))

        if (prepSessionInserts.length > 0) {
          const { error: prepError } = await supabase
            .from('prep_sessions')
            .insert(prepSessionInserts)

          if (prepError) {
            console.error('Error saving prep sessions:', prepError)
          }
        }

        // Send the final complete event
        sendEvent('complete', {
          id: savedPlan.id,
          week_start_date: savedPlan.week_start_date,
        })

        controller.close()
      } catch (error) {
        console.error('Error generating meal plan:', error)
        sendEvent('error', { error: 'Failed to generate meal plan' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
