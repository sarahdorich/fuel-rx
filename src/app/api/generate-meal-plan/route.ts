import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMealPlan } from '@/lib/claude'
import type { UserProfile } from '@/lib/types'

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

  try {
    // Generate meal plan using Claude
    const mealPlanData = await generateMealPlan(profile as UserProfile, recentMealNames)

    // Calculate week start date (next Monday)
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() + daysUntilMonday)
    const weekStartDate = weekStart.toISOString().split('T')[0]

    // Save meal plan to database
    const { data: savedPlan, error: saveError } = await supabase
      .from('meal_plans')
      .insert({
        user_id: user.id,
        week_start_date: weekStartDate,
        plan_data: mealPlanData.days,
        grocery_list: mealPlanData.grocery_list,
        is_favorite: false,
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving meal plan:', saveError)
      return NextResponse.json({ error: 'Failed to save meal plan' }, { status: 500 })
    }

    return NextResponse.json({
      id: savedPlan.id,
      week_start_date: savedPlan.week_start_date,
      days: mealPlanData.days,
      grocery_list: mealPlanData.grocery_list,
    })
  } catch (error) {
    console.error('Error generating meal plan:', error)
    return NextResponse.json(
      { error: 'Failed to generate meal plan' },
      { status: 500 }
    )
  }
}
