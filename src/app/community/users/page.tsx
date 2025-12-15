import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CommunityUsersClient from './CommunityUsersClient'

export default async function CommunityUsersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user has social feed enabled
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('social_feed_enabled')
    .eq('id', user.id)
    .single()

  if (!profile?.social_feed_enabled) {
    redirect('/settings/social')
  }

  return <CommunityUsersClient />
}
