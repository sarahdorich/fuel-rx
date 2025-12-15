import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ValidatedMealIngredient, CustomMealPrepTime } from '@/lib/types'

interface CreateCustomMealRequest {
  meal_name: string
  ingredients: ValidatedMealIngredient[]
  image_url?: string | null
  share_with_community?: boolean
  prep_time?: CustomMealPrepTime | null
}

interface UpdateCustomMealRequest extends CreateCustomMealRequest {
  id: string
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
        prep_time: body.prep_time || null,
      }, {
        onConflict: 'user_id,meal_name',
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving custom meal:', saveError)
      return NextResponse.json({ error: 'Failed to save custom meal' }, { status: 500 })
    }

    // If sharing and user has social feed enabled, post to social feed
    if (body.share_with_community) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('social_feed_enabled')
        .eq('id', user.id)
        .single()

      if (profile?.social_feed_enabled) {
        await supabase.from('social_feed_posts').upsert({
          user_id: user.id,
          source_type: 'custom_meal',
          source_meal_id: savedMeal.id,
          meal_name: savedMeal.meal_name,
          calories: savedMeal.calories,
          protein: savedMeal.protein,
          carbs: savedMeal.carbs,
          fat: savedMeal.fat,
          image_url: savedMeal.image_url,
          prep_time: savedMeal.prep_time,
          ingredients: savedMeal.ingredients,
        }, {
          onConflict: 'user_id,source_type,source_meal_id',
          ignoreDuplicates: false,
        })
      }
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

export async function PUT(request: Request) {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: UpdateCustomMealRequest = await request.json()

    // Validate request
    if (!body.id) {
      return NextResponse.json({ error: 'Meal ID is required' }, { status: 400 })
    }

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

    // Update the meal
    const { data: updatedMeal, error: updateError } = await supabase
      .from('validated_meals_by_user')
      .update({
        meal_name: body.meal_name.trim(),
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        ingredients: body.ingredients,
        image_url: body.image_url || null,
        share_with_community: body.share_with_community || false,
        prep_time: body.prep_time || null,
      })
      .eq('id', body.id)
      .eq('user_id', user.id)
      .eq('is_user_created', true)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating custom meal:', updateError)
      return NextResponse.json({ error: 'Failed to update custom meal' }, { status: 500 })
    }

    // Handle social feed post based on sharing setting
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('social_feed_enabled')
      .eq('id', user.id)
      .single()

    if (body.share_with_community && profile?.social_feed_enabled) {
      // Create or update feed post
      await supabase.from('social_feed_posts').upsert({
        user_id: user.id,
        source_type: 'custom_meal',
        source_meal_id: updatedMeal.id,
        meal_name: updatedMeal.meal_name,
        calories: updatedMeal.calories,
        protein: updatedMeal.protein,
        carbs: updatedMeal.carbs,
        fat: updatedMeal.fat,
        image_url: updatedMeal.image_url,
        prep_time: updatedMeal.prep_time,
        ingredients: updatedMeal.ingredients,
      }, {
        onConflict: 'user_id,source_type,source_meal_id',
        ignoreDuplicates: false,
      })
    } else {
      // Remove from feed if sharing disabled
      await supabase
        .from('social_feed_posts')
        .delete()
        .eq('user_id', user.id)
        .eq('source_type', 'custom_meal')
        .eq('source_meal_id', updatedMeal.id)
    }

    return NextResponse.json(updatedMeal)
  } catch (error) {
    console.error('Error updating custom meal:', error)
    return NextResponse.json({ error: 'Failed to update custom meal' }, { status: 500 })
  }
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
