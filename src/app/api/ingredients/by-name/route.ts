import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST - Get or create an ingredient by name
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, category } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json(
      { error: 'name is required' },
      { status: 400 }
    )
  }

  const normalizedName = name.toLowerCase().trim()

  // First try to find existing ingredient
  const { data: existing, error: findError } = await supabase
    .from('ingredients')
    .select('*')
    .eq('name_normalized', normalizedName)
    .single()

  if (existing) {
    return NextResponse.json(existing)
  }

  // If not found, create it using RPC function
  const { data: ingredientId, error: createError } = await supabase
    .rpc('get_or_create_ingredient', {
      p_name: name.trim(),
      p_category: category || 'other'
    })

  if (createError) {
    console.error('Error creating ingredient:', createError)
    return NextResponse.json({ error: 'Failed to create ingredient' }, { status: 500 })
  }

  // Fetch the created ingredient
  const { data: newIngredient, error: fetchError } = await supabase
    .from('ingredients')
    .select('*')
    .eq('id', ingredientId)
    .single()

  if (fetchError || !newIngredient) {
    console.error('Error fetching created ingredient:', fetchError)
    return NextResponse.json({ error: 'Failed to fetch ingredient' }, { status: 500 })
  }

  return NextResponse.json(newIngredient)
}
