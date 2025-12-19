# PR Review for FuelRx

Review the changes in the current branch compared to main. Provide a thorough code review following FuelRx conventions and best practices.

## Instructions

1. **Get the diff** - Run `git diff main...HEAD` to see all changes in this branch

2. **Identify changed files** - Run `git diff --name-only main...HEAD` to list modified files

3. **Review each category of changes:**

### Frontend Components (src/components/, src/app/**/page.tsx)
- [ ] Components use 'use client' directive only when needed (hooks, browser APIs, event handlers)
- [ ] Props are properly typed using TypeScript interfaces from `src/lib/types.ts`
- [ ] Loading and error states are handled appropriately
- [ ] Tailwind classes follow existing patterns (btn-primary, btn-secondary, input-field, card)
- [ ] Images use next/image with proper width/height or fill
- [ ] Forms use controlled/uncontrolled inputs consistently
- [ ] Modal components manage their own open/close state properly

### API Routes (src/app/api/**/route.ts)
- [ ] Proper HTTP methods exported (GET, POST, PUT, DELETE)
- [ ] Authentication check: `const { data: { user } } = await supabase.auth.getUser()`
- [ ] Returns 401 for unauthenticated requests
- [ ] Uses NextResponse.json() for responses
- [ ] Proper error handling with try/catch
- [ ] RLS policies will apply - verify queries respect user_id
- [ ] No sensitive data exposed in responses

### Database/Supabase (supabase/migrations/, src/lib/supabase/)
- [ ] Migrations are idempotent and safe to run
- [ ] RLS policies are properly defined for new tables
- [ ] Uses createServerClient for server-side, createBrowserClient for client-side
- [ ] Queries use proper Supabase methods (select, insert, update, delete, upsert)
- [ ] Storage bucket operations use correct bucket names (meal-images, profile-photos)

### Types (src/lib/types.ts)
- [ ] New types follow existing naming conventions (PascalCase)
- [ ] Interfaces extend existing types where appropriate
- [ ] Union types are used for fixed value sets
- [ ] Constants for labels/options follow UPPER_SNAKE_CASE

### Claude AI Integration (src/lib/claude.ts, src/app/api/generate-meal-plan/)
- [ ] API calls include proper error handling
- [ ] LLM calls are logged to llm_logs table
- [ ] System prompts are clear and structured
- [ ] JSON responses are properly validated

### Middleware & Auth (src/middleware.ts, src/lib/supabase/middleware.ts)
- [ ] Protected routes are properly matched
- [ ] Session updates are handled correctly
- [ ] Auth redirects work for both authenticated and unauthenticated states

## Security Checklist
- [ ] No hardcoded secrets or API keys
- [ ] User input is validated before database operations
- [ ] File uploads validate content type and size
- [ ] No SQL injection vulnerabilities (Supabase client handles this)
- [ ] No XSS vulnerabilities in rendered content
- [ ] Environment variables use NEXT_PUBLIC_ prefix only for client-safe values

## Performance Checklist
- [ ] Large lists should consider pagination
- [ ] Images are optimized (imageCompression.ts for uploads)
- [ ] No unnecessary re-renders (proper dependency arrays in useEffect/useMemo)
- [ ] Server Components used where possible (no 'use client' when not needed)

## Code Quality
- [ ] TypeScript strict mode compatibility (no any, proper null checks)
- [ ] Consistent code style (run `npm run lint` to check)
- [ ] No console.log statements left in production code
- [ ] Error messages are user-friendly
- [ ] Comments explain "why" not "what"

## Output Format

```
## PR Review: [branch-name]

### Summary
[1-2 sentences describing what this PR does]

### Files Changed
| File | Type | Notes |
|------|------|-------|
| path/to/file.tsx | Component | [brief note] |

### Issues

#### Critical (must fix)
- [ ] `file.ts:42` - [description]

#### Warnings (should fix)
- [ ] `file.ts:15` - [description]

#### Suggestions (nice to have)
- [ ] `file.ts:88` - [description]

### Test Checklist
- [ ] [specific test to perform]
- [ ] [another test]

### Verdict: [APPROVE | REQUEST_CHANGES | COMMENT]
[One sentence explanation]
```
