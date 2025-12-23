import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HouseholdSettingsClient from './HouseholdSettingsClient'
import { DEFAULT_HOUSEHOLD_SERVINGS_PREFS } from '@/lib/types'

export default async function HouseholdSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('household_servings')
    .eq('id', user.id)
    .single()

  return (
    <HouseholdSettingsClient
      initialSettings={profile?.household_servings ?? DEFAULT_HOUSEHOLD_SERVINGS_PREFS}
    />
  )
}
