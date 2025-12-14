import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-primary-600">Coach Hill&apos;s FuelRx</h1>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/login" className="text-gray-600 hover:text-gray-900 whitespace-nowrap">
              Log in
            </Link>
            <Link href="/signup" className="btn-primary whitespace-nowrap">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            AI-Powered Meal Planning for{' '}
            <span className="text-primary-600">CrossFit Draper Athletes</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Get personalized weekly meal plans optimized for your macros 
            and dietary preferences.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="btn-primary text-lg px-8 py-3">
              Start Planning Your Meals
            </Link>
            <Link href="/login" className="btn-outline text-lg px-8 py-3">
              I Already Have an Account
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Everything You Need to Fuel Your Training
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              title="Personalized Macros"
              description="Input your specific protein, carb, fat, and calorie goals. Every meal plan is tailored to hit your targets."
            />
            <FeatureCard
              title="Healthy, Whole Foods"
              description="Only non-processed or minimally processed foods. Real nutrition for real athletes."
            />
            <FeatureCard
              title="Auto Grocery Lists"
              description="Shop efficiently with categorized ingredient lists generated from your weekly meal plan."
            />
            <FeatureCard
              title="Prep Time Control"
              description="Set your available prep time and get meals that fit your schedule."
            />
            <FeatureCard
              title="Dietary Flexibility"
              description="Paleo, vegetarian, gluten-free, dairy-free - we've got you covered."
            />
            <FeatureCard
              title="Save & Favorite"
              description="Keep track of your best meal plans and access them anytime."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-primary-400 font-semibold mb-2">Coach Hill&apos;s FuelRx</p>
          <p className="text-sm">Built for the CrossFit Draper community</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="card hover:shadow-lg transition-shadow">
      <h4 className="text-xl font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}
