import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CommunityFeedClient from './CommunityFeedClient'

export default async function CommunityPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user has social feed enabled
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('social_feed_enabled, display_name, name')
    .eq('id', user.id)
    .single()

  return (
    <CommunityFeedClient
      socialEnabled={profile?.social_feed_enabled ?? false}
      userName={profile?.display_name || profile?.name || 'User'}
    />
  )
}
