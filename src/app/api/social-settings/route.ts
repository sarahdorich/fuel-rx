import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('social_feed_enabled, display_name')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching social settings:', error)
    return NextResponse.json({ error: 'Failed to fetch social settings' }, { status: 500 })
  }

  return NextResponse.json(profile)
}

export async function PUT(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { social_feed_enabled, display_name } = body

    // Validate inputs
    if (typeof social_feed_enabled !== 'boolean') {
      return NextResponse.json({ error: 'social_feed_enabled must be a boolean' }, { status: 400 })
    }

    if (display_name !== null && display_name !== undefined && typeof display_name !== 'string') {
      return NextResponse.json({ error: 'display_name must be a string or null' }, { status: 400 })
    }

    // Trim and validate display_name length
    const trimmedDisplayName = display_name?.trim() || null
    if (trimmedDisplayName && trimmedDisplayName.length > 50) {
      return NextResponse.json({ error: 'Display name must be 50 characters or less' }, { status: 400 })
    }

    const { data: updatedProfile, error } = await supabase
      .from('user_profiles')
      .update({
        social_feed_enabled,
        display_name: trimmedDisplayName,
      })
      .eq('id', user.id)
      .select('social_feed_enabled, display_name')
      .single()

    if (error) {
      console.error('Error updating social settings:', error)
      return NextResponse.json({ error: 'Failed to update social settings' }, { status: 500 })
    }

    // If disabling social feed, remove all feed posts by this user
    if (!social_feed_enabled) {
      await supabase
        .from('social_feed_posts')
        .delete()
        .eq('user_id', user.id)
    }

    return NextResponse.json(updatedProfile)
  } catch (error) {
    console.error('Error updating social settings:', error)
    return NextResponse.json({ error: 'Failed to update social settings' }, { status: 500 })
  }
}
