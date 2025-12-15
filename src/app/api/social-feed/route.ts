import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const filter = searchParams.get('filter') || 'all' // 'all' or 'following'
  const offset = (page - 1) * limit

  try {
    // Get users the current user follows
    let followingIds: string[] = []
    if (filter === 'following') {
      const { data: follows } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id)

      followingIds = follows?.map(f => f.following_id) || []

      // If not following anyone, return empty
      if (followingIds.length === 0) {
        return NextResponse.json({
          posts: [],
          hasMore: false,
          nextPage: null,
          totalCount: 0,
        })
      }
    }

    // Get saved post IDs for the current user
    const { data: savedPosts } = await supabase
      .from('saved_community_meals')
      .select('source_post_id')
      .eq('user_id', user.id)

    const savedPostIds = new Set(savedPosts?.map(sp => sp.source_post_id) || [])

    // Build query for feed posts
    let query = supabase
      .from('social_feed_posts')
      .select(`
        *,
        author:user_profiles!social_feed_posts_user_id_fkey(id, display_name, name)
      `, { count: 'exact' })
      .neq('user_id', user.id) // Exclude own posts
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply following filter
    if (filter === 'following' && followingIds.length > 0) {
      query = query.in('user_id', followingIds)
    }

    const { data: posts, error, count } = await query

    if (error) {
      console.error('Error fetching feed:', error)
      return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
    }

    // Add is_saved field to each post
    const postsWithSaved = posts?.map(post => ({
      ...post,
      is_saved: savedPostIds.has(post.id),
    })) || []

    const totalCount = count || 0
    const hasMore = offset + limit < totalCount

    return NextResponse.json({
      posts: postsWithSaved,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      totalCount,
    })
  } catch (error) {
    console.error('Error fetching feed:', error)
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
  }
}
