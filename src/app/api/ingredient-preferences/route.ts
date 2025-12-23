import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Fetch user's ingredient preferences
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use the view to get preferences with ingredient details
  const { data, error } = await supabase
    .from('ingredient_preferences_with_details')
    .select('*')
    .eq('user_id', user.id)
    .order('ingredient_name')

  if (error) {
    console.error('Error fetching ingredient preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST - Create or update an ingredient preference
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { ingredient_id, preference } = body

  if (!ingredient_id || !preference) {
    return NextResponse.json(
      { error: 'ingredient_id and preference are required' },
      { status: 400 }
    )
  }

  if (!['liked', 'disliked'].includes(preference)) {
    return NextResponse.json(
      { error: 'preference must be "liked" or "disliked"' },
      { status: 400 }
    )
  }

  // Verify the ingredient exists in the ingredients dimension table
  const { data: ingredient, error: ingredientError } = await supabase
    .from('ingredients')
    .select('id')
    .eq('id', ingredient_id)
    .single()

  if (ingredientError || !ingredient) {
    return NextResponse.json(
      { error: 'Ingredient not found' },
      { status: 404 }
    )
  }

  // Upsert the preference
  const { data, error } = await supabase
    .from('ingredient_preferences')
    .upsert({
      user_id: user.id,
      ingredient_id,
      preference,
    }, {
      onConflict: 'user_id,ingredient_id',
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving ingredient preference:', error)
    return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Remove an ingredient preference
export async function DELETE(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const ingredient_id = searchParams.get('ingredient_id')

  if (!ingredient_id) {
    return NextResponse.json(
      { error: 'ingredient_id is required' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('ingredient_preferences')
    .delete()
    .eq('user_id', user.id)
    .eq('ingredient_id', ingredient_id)

  if (error) {
    console.error('Error deleting ingredient preference:', error)
    return NextResponse.json({ error: 'Failed to delete preference' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
