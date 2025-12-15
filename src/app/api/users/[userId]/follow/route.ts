import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient()
  const { userId: targetUserId } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Can't follow yourself
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
  }

  try {
    // Check if target user exists and has social enabled
    const { data: targetProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, social_feed_enabled')
      .eq('id', targetUserId)
      .single()

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!targetProfile.social_feed_enabled) {
      return NextResponse.json({ error: 'User has not enabled social features' }, { status: 400 })
    }

    // Create follow relationship
    const { error: followError } = await supabase
      .from('user_follows')
      .insert({
        follower_id: user.id,
        following_id: targetUserId,
      })

    if (followError) {
      // Check if it's a duplicate
      if (followError.code === '23505') {
        return NextResponse.json({ following: true, message: 'Already following' })
      }
      console.error('Error following user:', followError)
      return NextResponse.json({ error: 'Failed to follow user' }, { status: 500 })
    }

    return NextResponse.json({ following: true })
  } catch (error) {
    console.error('Error following user:', error)
    return NextResponse.json({ error: 'Failed to follow user' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient()
  const { userId: targetUserId } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { error: unfollowError } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId)

    if (unfollowError) {
      console.error('Error unfollowing user:', unfollowError)
      return NextResponse.json({ error: 'Failed to unfollow user' }, { status: 500 })
    }

    return NextResponse.json({ following: false })
  } catch (error) {
    console.error('Error unfollowing user:', error)
    return NextResponse.json({ error: 'Failed to unfollow user' }, { status: 500 })
  }
}
