import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GroceryListClient from './GroceryListClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroceryListPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: mealPlan, error } = await supabase
    .from('meal_plans')
    .select('id, week_start_date, grocery_list, core_ingredients')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !mealPlan) {
    notFound()
  }

  return (
    <GroceryListClient
      mealPlanId={mealPlan.id}
      weekStartDate={mealPlan.week_start_date}
      groceryList={mealPlan.grocery_list}
      coreIngredients={mealPlan.core_ingredients}
    />
  )
}
