import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Check if user needs to complete onboarding
  if (!profile || profile.target_protein === 150 && profile.target_carbs === 200 && profile.target_fat === 70) {
    // User has default values, likely hasn't completed onboarding
    // We'll still show dashboard but prompt them
  }

  // Get most recent meal plan
  const { data: recentPlan } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <DashboardClient
      profile={profile}
      recentPlan={recentPlan}
    />
  )
}
