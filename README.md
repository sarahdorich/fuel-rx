# FuelRx

AI-powered meal planning for CrossFit athletes. FuelRx generates personalized weekly meal plans optimized for your macros, training schedule, and dietary preferences.

## Overview

FuelRx helps CrossFit athletes take the guesswork out of nutrition. Answer a few questions about your macro targets and preferences, and get a full week of meal plans designed to fuel your training—complete with recipes, macro breakdowns, and grocery lists.

Built for athletes who know nutrition matters but struggle with meal planning and prep due to time constraints or decision fatigue.

## Features

- **Personalized Macro Targeting**: Input your specific protein, carb, fat, and calorie goals
- **AI-Generated Meal Plans**: Weekly meal plans created using Claude AI based on your preferences
- **Dietary Flexibility**: Support for various dietary preferences ("No restrictions", "Paleo", "Vegetarian", "Gluten-free" and "Dairy-free")
- **Only Healthy Meals**: Only recommends/generates healthy and non-processed or minimally processed foods for users
- **Prep Time Optimization**: Meals tailored to your available prep time (options: 5min, 15min, 30min, 45min, 60min)
- **Auto-Generated Grocery Lists**: Shop efficiently with categorized ingredient lists
- **WOD-Aware Nutrition** (planned): Adjust meals based on workout intensity

## Tech Stack

### Frontend
- **Next.js** - React framework with server-side rendering, routing, and optimized deployment
- **React** - Component-based UI library
- **Tailwind CSS** - Utility-first CSS framework for styling
- **TypeScript** - Type-safe JavaScript for better developer experience

### Backend
- **Supabase** (Free Tier)
  - PostgreSQL database (500MB storage)
  - Built-in authentication
  - Row Level Security (RLS) for data protection
  - Real-time subscriptions
  - 1GB file storage, 2GB bandwidth/month

### AI/ML
- **Claude API** (Anthropic)
  - Generates personalized meal plans
  - Pay-as-you-go pricing (~$3 per million input tokens)
  - Powered by Claude Sonnet for optimal cost/performance

### Hosting & Deployment
- **Vercel** (Free Tier)
  - Automatic deployments from Git
  - Edge network for fast global delivery
  - 100GB bandwidth/month
  - Built-in CI/CD

## Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account
- Anthropic API key for Claude
- Vercel account (for deployment)

### Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Supabase
SUPABASE_PROJECT_URL=your_supabase_project_url
SUPABASE_API_KEY=your_supabase_anon_key

# Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Installation

```bash
# Clone the repository
git clone https://github.com/sarahdorich/fuel-rx.git
cd fuel-rx

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Database Setup

Run the SQL migrations in your Supabase project (see `/supabase/migrations` folder):

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    weight DECIMAL,
    target_protein INT,
    target_carbs INT,
    target_fat INT,
    target_calories INT,
    dietary_prefs TEXT[],
    meals_per_day INT,
    prep_time INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Meal plans table
CREATE TABLE meal_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    week_start_date DATE,
    plan_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Project Structure

```
fuel-rx/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Home page
│   ├── onboarding/        # User onboarding flow
│   ├── meal-plan/         # Meal plan display
│   └── grocery-list/      # Shopping list
├── components/            # Reusable React components
├── lib/                   # Utility functions
│   ├── supabase.ts       # Supabase client
│   ├── claude.ts         # Claude API integration
│   └── types.ts          # TypeScript types
├── public/               # Static assets
├── supabase/             # Database migrations
└── styles/               # Global styles
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel dashboard
3. Add environment variables in Vercel project settings
4. Deploy automatically on push to main branch

```bash
# Or use Vercel CLI
npm install -g vercel
vercel
```

## Roadmap

- [x] Basic meal plan generation
- [x] Macro tracking
- [x] Grocery list generation
- [x] Meal/recipe generation
- [ ] User authentication
- [ ] Save/favorite meal plans
- [ ] WOD-aware meal adjustments
- [ ] Community recipe sharing
- [ ] Mobile app (PWA)
- [ ] Performance correlation tracking

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Contact

For questions or feedback, please open an issue on GitHub.

---

Built with ❤️ for the CrossFit community
