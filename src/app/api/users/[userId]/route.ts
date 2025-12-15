import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient()
  const { userId: targetUserId } = await params

  const { data: { user } } = await supabase.auth.getUser()

  try {
    // Get target user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, display_name, name, social_feed_enabled')
      .eq('id', targetUserId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only return public info if social is enabled
    if (!profile.social_feed_enabled) {
      return NextResponse.json({ error: 'User profile is private' }, { status: 403 })
    }

    // Get follower count
    const { count: followerCount } = await supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', targetUserId)

    // Get following count
    const { count: followingCount } = await supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', targetUserId)

    // Get post count
    const { count: postCount } = await supabase
      .from('social_feed_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', targetUserId)

    // Check if current user is following
    let isFollowing = false
    if (user && user.id !== targetUserId) {
      const { data: followData } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .single()

      isFollowing = !!followData
    }

    return NextResponse.json({
      id: profile.id,
      display_name: profile.display_name,
      name: profile.name,
      social_feed_enabled: profile.social_feed_enabled,
      follower_count: followerCount || 0,
      following_count: followingCount || 0,
      post_count: postCount || 0,
      is_following: isFollowing,
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 })
  }
}
