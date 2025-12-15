import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const supabase = await createClient()
  const { postId } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get the feed post
    const { data: post, error: postError } = await supabase
      .from('social_feed_posts')
      .select('*')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Can't save your own post
    if (post.user_id === user.id) {
      return NextResponse.json({ error: 'Cannot save your own meal' }, { status: 400 })
    }

    // Check if already saved
    const { data: existing } = await supabase
      .from('saved_community_meals')
      .select('id')
      .eq('user_id', user.id)
      .eq('source_post_id', postId)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Already saved' }, { status: 400 })
    }

    // Create saved_community_meals record
    const { error: saveError } = await supabase
      .from('saved_community_meals')
      .insert({
        user_id: user.id,
        source_post_id: postId,
        original_author_id: post.user_id,
      })

    if (saveError) {
      console.error('Error saving meal:', saveError)
      return NextResponse.json({ error: 'Failed to save meal' }, { status: 500 })
    }

    // Copy to user's validated_meals_by_user
    const { data: savedMeal, error: mealError } = await supabase
      .from('validated_meals_by_user')
      .upsert({
        user_id: user.id,
        meal_name: post.meal_name,
        calories: post.calories,
        protein: post.protein,
        carbs: post.carbs,
        fat: post.fat,
        ingredients: post.ingredients,
        is_user_created: true,
        image_url: post.image_url,
        share_with_community: false, // Don't auto-share saved meals
        prep_time: post.prep_time,
      }, {
        onConflict: 'user_id,meal_name',
      })
      .select()
      .single()

    if (mealError) {
      console.error('Error copying meal:', mealError)
      // Still consider it saved even if copy failed
    }

    return NextResponse.json({
      saved: true,
      customMealId: savedMeal?.id || null,
    })
  } catch (error) {
    console.error('Error saving meal:', error)
    return NextResponse.json({ error: 'Failed to save meal' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const supabase = await createClient()
  const { postId } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get the saved meal to find the meal name
    const { data: savedMeal } = await supabase
      .from('saved_community_meals')
      .select('source_post_id')
      .eq('user_id', user.id)
      .eq('source_post_id', postId)
      .single()

    if (!savedMeal) {
      return NextResponse.json({ error: 'Not saved' }, { status: 404 })
    }

    // Get the post to know which meal to potentially remove
    const { data: post } = await supabase
      .from('social_feed_posts')
      .select('meal_name')
      .eq('id', postId)
      .single()

    // Remove the saved record
    const { error: deleteError } = await supabase
      .from('saved_community_meals')
      .delete()
      .eq('user_id', user.id)
      .eq('source_post_id', postId)

    if (deleteError) {
      console.error('Error removing saved meal:', deleteError)
      return NextResponse.json({ error: 'Failed to remove saved meal' }, { status: 500 })
    }

    // Note: We don't delete from validated_meals_by_user since the user might have
    // modified it or want to keep it. They can delete it manually from custom meals.

    return NextResponse.json({ saved: false })
  } catch (error) {
    console.error('Error removing saved meal:', error)
    return NextResponse.json({ error: 'Failed to remove saved meal' }, { status: 500 })
  }
}
