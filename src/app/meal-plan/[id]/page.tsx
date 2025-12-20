import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MealPlanClient from './MealPlanClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MealPlanPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: mealPlan, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !mealPlan) {
    notFound()
  }

  return (
    <MealPlanClient
      mealPlan={{
        id: mealPlan.id,
        week_start_date: mealPlan.week_start_date,
        title: mealPlan.title,
        days: mealPlan.plan_data,
        grocery_list: mealPlan.grocery_list,
        is_favorite: mealPlan.is_favorite,
        created_at: mealPlan.created_at,
        core_ingredients: mealPlan.core_ingredients,
      }}
    />
  )
}
