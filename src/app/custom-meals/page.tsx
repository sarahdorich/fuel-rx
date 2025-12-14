import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomMealsClient from './CustomMealsClient'

export default async function CustomMealsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user's custom meals
  const { data: customMeals } = await supabase
    .from('validated_meals_by_user')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_user_created', true)
    .order('created_at', { ascending: false })

  return <CustomMealsClient initialMeals={customMeals || []} />
}
