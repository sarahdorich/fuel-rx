import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ValidatedMealIngredient } from '@/lib/types'

interface CreateCustomMealRequest {
  meal_name: string
  ingredients: ValidatedMealIngredient[]
  image_url?: string | null
  share_with_community?: boolean
}

export async function POST(request: Request) {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: CreateCustomMealRequest = await request.json()

    // Validate request
    if (!body.meal_name || typeof body.meal_name !== 'string' || body.meal_name.trim() === '') {
      return NextResponse.json({ error: 'Meal name is required' }, { status: 400 })
    }

    if (!body.ingredients || !Array.isArray(body.ingredients) || body.ingredients.length === 0) {
      return NextResponse.json({ error: 'At least one ingredient is required' }, { status: 400 })
    }

    // Validate each ingredient has required fields
    for (const ingredient of body.ingredients) {
      if (!ingredient.name || typeof ingredient.name !== 'string') {
        return NextResponse.json({ error: 'Each ingredient must have a name' }, { status: 400 })
      }
      if (typeof ingredient.calories !== 'number' || ingredient.calories < 0) {
        return NextResponse.json({ error: 'Each ingredient must have valid calories' }, { status: 400 })
      }
      if (typeof ingredient.protein !== 'number' || ingredient.protein < 0) {
        return NextResponse.json({ error: 'Each ingredient must have valid protein' }, { status: 400 })
      }
      if (typeof ingredient.carbs !== 'number' || ingredient.carbs < 0) {
        return NextResponse.json({ error: 'Each ingredient must have valid carbs' }, { status: 400 })
      }
      if (typeof ingredient.fat !== 'number' || ingredient.fat < 0) {
        return NextResponse.json({ error: 'Each ingredient must have valid fat' }, { status: 400 })
      }
    }

    // Calculate total macros from ingredients
    const totalCalories = body.ingredients.reduce((sum, ing) => sum + ing.calories, 0)
    const totalProtein = body.ingredients.reduce((sum, ing) => sum + ing.protein, 0)
    const totalCarbs = body.ingredients.reduce((sum, ing) => sum + ing.carbs, 0)
    const totalFat = body.ingredients.reduce((sum, ing) => sum + ing.fat, 0)

    // Save to validated_meals_by_user
    const { data: savedMeal, error: saveError } = await supabase
      .from('validated_meals_by_user')
      .upsert({
        user_id: user.id,
        meal_name: body.meal_name.trim(),
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        ingredients: body.ingredients,
        is_user_created: true,
        image_url: body.image_url || null,
        share_with_community: body.share_with_community || false,
      }, {
        onConflict: 'user_id,meal_name',
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving custom meal:', saveError)
      return NextResponse.json({ error: 'Failed to save custom meal' }, { status: 500 })
    }

    return NextResponse.json(savedMeal)
  } catch (error) {
    console.error('Error creating custom meal:', error)
    return NextResponse.json({ error: 'Failed to create custom meal' }, { status: 500 })
  }
}

export async function GET() {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch user's custom meals
  const { data: customMeals, error } = await supabase
    .from('validated_meals_by_user')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_user_created', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching custom meals:', error)
    return NextResponse.json({ error: 'Failed to fetch custom meals' }, { status: 500 })
  }

  return NextResponse.json(customMeals)
}

export async function DELETE(request: Request) {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const mealId = searchParams.get('id')

    if (!mealId) {
      return NextResponse.json({ error: 'Meal ID is required' }, { status: 400 })
    }

    const { error: deleteError } = await supabase
      .from('validated_meals_by_user')
      .delete()
      .eq('id', mealId)
      .eq('user_id', user.id)
      .eq('is_user_created', true)

    if (deleteError) {
      console.error('Error deleting custom meal:', deleteError)
      return NextResponse.json({ error: 'Failed to delete custom meal' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting custom meal:', error)
    return NextResponse.json({ error: 'Failed to delete custom meal' }, { status: 500 })
  }
}
