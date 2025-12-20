import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrepSettingsClient from './PrepSettingsClient'

export default async function PrepSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('prep_style, breakfast_complexity, lunch_complexity, dinner_complexity')
    .eq('id', user.id)
    .single()

  return (
    <PrepSettingsClient
      initialSettings={{
        prep_style: profile?.prep_style ?? 'mixed',
        breakfast_complexity: profile?.breakfast_complexity ?? 'minimal_prep',
        lunch_complexity: profile?.lunch_complexity ?? 'minimal_prep',
        dinner_complexity: profile?.dinner_complexity ?? 'full_recipe',
      }}
    />
  )
}
