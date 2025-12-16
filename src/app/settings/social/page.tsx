import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SocialSettingsClient from './SocialSettingsClient'

export default async function SocialSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('social_feed_enabled, display_name, name, profile_photo_url')
    .eq('id', user.id)
    .single()

  return (
    <SocialSettingsClient
      initialSettings={{
        social_feed_enabled: profile?.social_feed_enabled ?? false,
        display_name: profile?.display_name ?? null,
        name: profile?.name ?? null,
        profile_photo_url: profile?.profile_photo_url ?? null,
      }}
    />
  )
}
