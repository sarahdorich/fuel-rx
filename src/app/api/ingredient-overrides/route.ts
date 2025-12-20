import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DayPlan, Ingredient } from '@/lib/types'

// POST: Create or update an ingredient nutrition override
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      ingredient_name,
      serving_size,
      serving_unit,
      original_calories,
      original_protein,
      original_carbs,
      original_fat,
      override_calories,
      override_protein,
      override_carbs,
      override_fat,
      meal_plan_id,
      meal_name,
    } = body

    // Validate required fields
    if (!ingredient_name || serving_size === undefined || !serving_unit) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (override_calories === undefined || override_protein === undefined ||
        override_carbs === undefined || override_fat === undefined) {
      return NextResponse.json({ error: 'Missing override values' }, { status: 400 })
    }

    const normalizedName = ingredient_name.toLowerCase().trim()

    // Upsert the override (one override per user per ingredient per serving)
    const { data, error } = await supabase
      .from('ingredient_nutrition_user_override')
      .upsert({
        user_id: user.id,
        ingredient_name,
        ingredient_name_normalized: normalizedName,
        serving_size,
        serving_unit,
        original_calories,
        original_protein,
        original_carbs,
        original_fat,
        override_calories,
        override_protein,
        override_carbs,
        override_fat,
        meal_plan_id,
        meal_name,
        validation_status: 'pending',
      }, {
        onConflict: 'user_id,ingredient_name_normalized,serving_size,serving_unit',
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving ingredient override:', error)
      return NextResponse.json({ error: 'Failed to save override' }, { status: 500 })
    }

    return NextResponse.json({ success: true, override: data })
  } catch (error) {
    console.error('Error in ingredient override:', error)
    return NextResponse.json({ error: 'Failed to save override' }, { status: 500 })
  }
}

// GET: Fetch user's ingredient overrides
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const mealPlanId = searchParams.get('meal_plan_id')

    let query = supabase
      .from('ingredient_nutrition_user_override')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (mealPlanId) {
      query = query.eq('meal_plan_id', mealPlanId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching ingredient overrides:', error)
      return NextResponse.json({ error: 'Failed to fetch overrides' }, { status: 500 })
    }

    return NextResponse.json({ overrides: data })
  } catch (error) {
    console.error('Error in ingredient overrides GET:', error)
    return NextResponse.json({ error: 'Failed to fetch overrides' }, { status: 500 })
  }
}
