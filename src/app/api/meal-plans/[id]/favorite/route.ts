import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DayPlan, Meal } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: mealPlanId } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { is_favorite } = body

    if (typeof is_favorite !== 'boolean') {
      return NextResponse.json({ error: 'is_favorite must be a boolean' }, { status: 400 })
    }

    // Update the meal plan favorite status
    const { error: updateError } = await supabase
      .from('meal_plans')
      .update({ is_favorite })
      .eq('id', mealPlanId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating favorite:', updateError)
      return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 })
    }

    // Check if user has social feed enabled
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('social_feed_enabled')
      .eq('id', user.id)
      .single()

    if (is_favorite && profile?.social_feed_enabled) {
      // Get the meal plan to access meals
      const { data: mealPlan } = await supabase
        .from('meal_plans')
        .select('plan_data')
        .eq('id', mealPlanId)
        .eq('user_id', user.id)
        .single()

      if (mealPlan?.plan_data) {
        const days = mealPlan.plan_data as DayPlan[]

        // Collect all unique meals from the plan
        const uniqueMeals = new Map<string, Meal>()
        days.forEach(day => {
          day.meals.forEach(meal => {
            if (!uniqueMeals.has(meal.name)) {
              uniqueMeals.set(meal.name, meal)
            }
          })
        })

        // Create feed posts for each unique meal
        const feedPosts = Array.from(uniqueMeals.values()).map(meal => ({
          user_id: user.id,
          source_type: 'favorited_meal' as const,
          source_meal_plan_id: mealPlanId,
          meal_name: meal.name,
          calories: meal.macros.calories,
          protein: meal.macros.protein,
          carbs: meal.macros.carbs,
          fat: meal.macros.fat,
          prep_time: meal.prep_time_minutes <= 5 ? '5_or_less' :
                     meal.prep_time_minutes <= 15 ? '15' :
                     meal.prep_time_minutes <= 30 ? '30' : 'more_than_30',
          ingredients: meal.ingredients.map(ing => ({
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
          })),
          instructions: meal.instructions,
          meal_type: meal.type,
        }))

        // Insert feed posts (ignore conflicts for existing posts)
        for (const post of feedPosts) {
          await supabase.from('social_feed_posts').upsert(post, {
            onConflict: 'user_id,source_type,source_meal_plan_id,meal_name',
            ignoreDuplicates: true,
          })
        }
      }
    } else if (!is_favorite) {
      // Remove feed posts when unfavoriting
      await supabase
        .from('social_feed_posts')
        .delete()
        .eq('user_id', user.id)
        .eq('source_type', 'favorited_meal')
        .eq('source_meal_plan_id', mealPlanId)
    }

    return NextResponse.json({ success: true, is_favorite })
  } catch (error) {
    console.error('Error updating favorite:', error)
    return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 })
  }
}
