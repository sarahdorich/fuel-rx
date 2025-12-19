# FuelRx

**"Your week of food, figured out."**

FuelRx is a convenience app that takes the mental load out of eating well. We help CrossFit athletes answer one question each week: *"What should I buy and cook to fuel my training?"* — with AI-generated plans refined by a community of real athletes sharing what actually works.

We are not a tracking app. We don't ask users to log meals, count calories daily, or maintain streaks. Instead, we deliver a complete system — meal plan, grocery list, and prep game plan — so athletes can stop thinking about food and start performing.

---

# 📑 Table of Contents

<!-- TOC_START -->
- [FuelRx](#fuelrx)
- [📑 Table of Contents](#-table-of-contents)
- [Core Philosophy](#core-philosophy)
- [The Core Loop](#the-core-loop)
- [The Pitch](#the-pitch)
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [AI/ML](#aiml)
  - [Hosting \& Deployment](#hosting--deployment)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Installation](#installation)
  - [Database Setup](#database-setup)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
  - [Deploy to Vercel](#deploy-to-vercel)
- [Feature Roadmap](#feature-roadmap)
  - [🔧 Meal Plan Quality Improvements](#-meal-plan-quality-improvements)
  - [⚡ Convenience Features](#-convenience-features)
  - [📸 Photo Capture ("Snap a Meal")](#-photo-capture-snap-a-meal)
  - [👥 Community Features](#-community-features)
  - [Priority Order (Suggested)](#priority-order-suggested)
- [What We're NOT Building](#what-were-not-building)
- [Success Metrics](#success-metrics)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)
<!-- TOC_END -->

---

# Core Philosophy

- **Convenience over compliance** — Make healthy eating the path of least resistance
- **Plan once, eat all week** — Minimize daily decisions
- **Community as cookbook** — Other athletes' real meals make your planning easier
- **No tracking guilt** — Generate, shop, eat, repeat

---

# The Core Loop

```
Generate Plan → Shop → Prep → Eat → Repeat
```

Every feature should make this loop faster, easier, or more enjoyable.

---

# The Pitch

> FuelRx gives CrossFit athletes a meal plan, a grocery list, and a prep game plan — powered by AI and refined by a community of athletes who eat like you. Stop thinking about food. Start performing.

---

# Overview

FuelRx helps CrossFit athletes take the guesswork out of nutrition. Answer a few questions about your macro targets and preferences, and get a full week of meal plans designed to fuel your training—complete with recipes, macro breakdowns, and grocery lists.

Built for athletes who know nutrition matters but struggle with meal planning and prep due to time constraints or decision fatigue.

# Features

- **Personalized Macro Targeting**: Input your specific protein, carb, fat, and calorie goals
- **AI-Generated Meal Plans**: Weekly meal plans created using Claude AI based on your preferences
- **Dietary Flexibility**: Support for various dietary preferences ("No restrictions", "Paleo", "Vegetarian", "Gluten-free" and "Dairy-free")
- **Only Healthy Meals**: Only recommends/generates healthy and non-processed or minimally processed foods for users
- **Prep Time Optimization**: Meals tailored to your available prep time (options: 5min, 15min, 30min, 45min, 60min)
- **Auto-Generated Grocery Lists**: Shop efficiently with categorized ingredient lists
- **WOD-Aware Nutrition** (planned): Adjust meals based on workout intensity

# Tech Stack

## Frontend
- **Next.js** - React framework with server-side rendering, routing, and optimized deployment
- **React** - Component-based UI library
- **Tailwind CSS** - Utility-first CSS framework for styling
- **TypeScript** - Type-safe JavaScript for better developer experience

## Backend
- **Supabase** (Free Tier)
  - PostgreSQL database (500MB storage)
  - Built-in authentication
  - Row Level Security (RLS) for data protection
  - Real-time subscriptions
  - 1GB file storage, 2GB bandwidth/month

## AI/ML
- **Claude API** (Anthropic)
  - Generates personalized meal plans
  - Pay-as-you-go pricing (~$3 per million input tokens)
  - Powered by Claude Sonnet for optimal cost/performance

## Hosting & Deployment
- **Vercel** (Free Tier)
  - Automatic deployments from Git
  - Edge network for fast global delivery
  - 100GB bandwidth/month
  - Built-in CI/CD

# Getting Started

## Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account
- Anthropic API key for Claude
- Vercel account (for deployment)

## Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Supabase
SUPABASE_PROJECT_URL=your_supabase_project_url
SUPABASE_API_KEY=your_supabase_anon_key

# Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Installation

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

## Database Setup

Run the SQL migrations in your Supabase project (see `/supabase/migrations` folder).

For local development, we use the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started?queryGroups=platform&platform=macos).

Install the supabase cli:
```
brew install supabase/tap/supabase
brew upgrade supabase
```

Install [Docker Desktop](https://docs.docker.com/desktop/).

Check migration status with:
```bash
supabase migration list --linked
```

You can view your local supabase instance here: http://127.0.0.1:54333/

To add a new migration file:
```bash
supabase migration new <description>
```

To run new migrations locally:
```bash
supabase migration up
```


# Project Structure

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

# Deployment

## Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel dashboard
3. Add environment variables in Vercel project settings
4. Deploy automatically on push to main branch

```bash
# Or use Vercel CLI
npm install -g vercel
vercel
```

# Feature Roadmap

## 🔧 Meal Plan Quality Improvements

**Extended Meal Memory**
- Track meal names from the last 3-4 weeks (not just 1 week)
- Pass to LLM as exclusion list to prevent repetition
- Solves: "FuelRx keeps suggesting the same meals"

**Variety Anchors in Prompts**
- Instruct LLM to use 3+ different protein sources per week
- Require 2+ cuisine styles (Mediterranean, Asian, Mexican, etc.)
- Add seasonal hints based on current month

**Ingredient-Efficient Meal Generation**
- New user preference: "Optimize for simpler shopping"
- When enabled, LLM designs meals around shared anchor ingredients:
  - 2-3 core proteins (chicken breast, ground beef, salmon)
  - 4-5 versatile vegetables (broccoli, bell peppers, spinach, sweet potatoes)
- Meals vary in preparation but share base ingredients
- Solves: "The grocery list is too long"

**Leftover Intelligence**
- LLM considers multi-serving meals when planning
- "Tuesday's grilled chicken makes Wednesday's lunch salad"
- Reduces cooking sessions and waste

**WOD-Meal Pairing**
- User inputs weekly training schedule (no gym app integration needed but could be cool to integrate with PushPress's API)
- For each day: workout type (rest, light, moderate, heavy, intense) and time (morning, midday, evening)
- LLM adjusts meals based on training:
  - Rest days: Lower carbs, anti-inflammatory foods
  - Heavy/strength days: Higher protein emphasis
  - Intense days: Prioritize carbs, especially around workout
- Meal timing adapts to workout time:
  - Morning WOD → lighter breakfast, substantial post-workout meal
  - Evening WOD → lunch as pre-fuel, dinner focused on recovery
- Start with manual input; gym app integration (PushPress, etc.) possible later
- Differentiator: No other meal app does this well for CrossFit

---

## ⚡ Convenience Features

**Meal Prep Mode**
- Transform 21 separate meals into a structured prep plan
- "Sunday Prep Session" view showing:
  - What to batch cook
  - Estimated total time
  - Which meals each prep item feeds
- Daily view shows assembly only, not full cooking
- High-impact differentiator

**Quick Swap**
- One tap on any meal shows 3 alternatives with similar macros
- No regenerating the whole plan
- Keeps plans flexible when life changes

**Ingredient Substitution**
- "Out of salmon?" → "Swap for cod, chicken thigh, or canned tuna"
- Prevents missing ingredients from derailing the plan
- LLM-powered, feels like magic

**Costco Mode**
- Leverage your inventory scraper
- "Optimize my plan for what's available at Costco"
- Match meals to actual products at user's local warehouse
- Nobody else does this — genuine differentiator

**One-Click Grocery Export**
- Export to Instacart, Amazon Fresh, Walmart
- Or clean shareable list for texting
- Fewer steps between plan and groceries in kitchen

---

## 📸 Photo Capture ("Snap a Meal")

**The Flow**
1. User takes photo of a meal they made
2. Claude Vision analyzes and identifies:
   - Suggested meal name
   - Visible ingredients with estimated portions
   - Estimated macros
3. User reviews, tweaks if needed, saves
4. Optional: Share with community

**Smart Matching**
- After analysis, search existing database for similar meals
- "This looks like Community Member's Teriyaki Bowl — use those verified macros?"
- Turns photo into search tool, not just estimation

**Low-Friction Capture**
- "Meal Memory" — snap without committing
- Review at week's end: "Add any of these to saved meals?"
- Builds personal cookbook over time with zero effort

---

## 👥 Community Features

**Guiding Principle**: Community as a smart recipe database, not a social network. Users benefit from collective wisdom without social pressure.

**Passive Quality Signals**
- Track when users keep vs. swap meals (no explicit rating needed)
- Powers "Most-kept meals" and "Fan favorites"
- Quality emerges from usage, not voting

**Taste Twins**
- Match users with similar macros, dietary prefs, and swap patterns
- "Athletes like you loved these meals"
- No following required — quiet algorithmic matching

**Browse by Problem**
- Replace endless feed with practical search:
  - "I have 20 minutes"
  - "I need to use chicken thighs"
  - "Big batch Sunday prep"
  - "Eating same lunch all week"
  - "Something different"
- Community feels like organized cookbook

**One-Tap Plan Integration**
- "Add to Next Week" — slot community meal into your plan
- AI rebalances macros and updates grocery list automatically
- "Replace All My Breakfasts" — lock in a community meal as default
- "Steal This Week" — clone another athlete's full plan as starting point

**Curated Collections**
- "Coach Hillari's Favorites" — permanent collection adding personality
- Guest collections from coaches or respected athletes
- "FuelRx Verified" badge for macro-accurate community favorites

**Contribution Without Pressure**
- "Your meal helped 43 athletes this week" — warm feedback
- Recipe remixes saved when users tweak community meals
- Contributing feels rewarding but is never required

---

## Priority Order (Suggested)

| Phase | Features | Impact |
|-------|----------|--------|
| 1 | Extended meal memory, Ingredient-efficient generation | Fix current pain points |
| 2 | Meal Prep Mode | Major differentiator |
| 3 | Quick Swap, Ingredient Substitution | Daily convenience |
| 4 | Snap a Meal (photo capture) | Frictionless meal saving |
| 5 | Browse by Problem, One-tap plan integration | Community becomes useful |
| 6 | Costco Mode, Grocery export | Shopping convenience |
| 7 | Passive quality signals, Taste Twins | Smart recommendations |

---

# What We're NOT Building

- Daily logging or check-ins
- Streak tracking or gamification
- Calorie counting interface
- Social feeds requiring engagement
- Anything requiring daily app opens (this app is meant to be opened maybe once per week to help athletes plan their meals)

---

# Success Metrics

- **Weekly active generation** — Users creating meal plans
- **Grocery list exports** — Plans converting to shopping
- **Swap rate** — Lower = better meal quality
- **Community meal additions** — Plans enriched by community
- **Time to plan** — Getting faster over time

---

# Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

# License

MIT License - see LICENSE file for details

# Contact

For questions or feedback, please open an issue on GitHub.

---

*Built with ❤️ for athletes who'd rather lift than meal plan.*
