import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import IngredientSettingsClient from './IngredientSettingsClient'

export default async function IngredientSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user's current ingredient preferences
  const { data: preferences } = await supabase
    .from('ingredient_preferences_with_details')
    .select('*')
    .eq('user_id', user.id)
    .order('ingredient_name')

  return (
    <IngredientSettingsClient
      initialPreferences={preferences || []}
    />
  )
}
