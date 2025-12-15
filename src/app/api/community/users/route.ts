import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const offset = (page - 1) * limit

  try {
    // Get users the current user follows
    const { data: follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = new Set(follows?.map(f => f.following_id) || [])

    // Build query for users with social enabled
    let query = supabase
      .from('user_profiles')
      .select('id, display_name, name, social_feed_enabled', { count: 'exact' })
      .eq('social_feed_enabled', true)
      .neq('id', user.id) // Exclude self
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply search filter
    if (search) {
      query = query.or(`display_name.ilike.%${search}%,name.ilike.%${search}%`)
    }

    const { data: users, error, count } = await query

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Add is_following field and fetch post counts
    const usersWithFollowStatus = await Promise.all(
      (users || []).map(async (profile) => {
        const { count: postCount } = await supabase
          .from('social_feed_posts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id)

        return {
          ...profile,
          is_following: followingIds.has(profile.id),
          post_count: postCount || 0,
        }
      })
    )

    const totalCount = count || 0
    const hasMore = offset + limit < totalCount

    return NextResponse.json({
      users: usersWithFollowStatus,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      totalCount,
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
