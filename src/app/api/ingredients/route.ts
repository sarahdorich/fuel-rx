import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Fetch all ingredients (with optional search/filter)
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')
  const category = searchParams.get('category')
  const limit = parseInt(searchParams.get('limit') || '100')

  let query = supabase
    .from('ingredients')
    .select('*')
    .order('name')
    .limit(limit)

  // Apply search filter if provided
  if (search) {
    query = query.ilike('name_normalized', `%${search.toLowerCase()}%`)
  }

  // Apply category filter if provided
  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching ingredients:', error)
    return NextResponse.json({ error: 'Failed to fetch ingredients' }, { status: 500 })
  }

  return NextResponse.json(data)
}
