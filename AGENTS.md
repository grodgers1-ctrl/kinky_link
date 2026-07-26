<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:auth-learnings -->
## Auth + Supabase learnings

See `auth-supabase-learnings.md` for specific lessons about:
- `@auth/supabase-adapter` schema behavior
- PostgREST camelCase/snake_case pitfalls
- NextAuth v5 beta JWT callback patterns
- Route group vs URL path behavior
- Orphaned user cleanup
<!-- END:auth-learnings -->

<!-- BEGIN:brand-guidelines -->
## Brand: kinkylink

Brand assets and full guide at `public/brand/kinkylink_brand.md`.

### Quick reference
- **Primary:** Placebo Sky `#ECFBFD`
- **Secondary:** Floppy Disk `#140044`
- **Accent:** Red Flag `#FF224B`
- **Surface:** Off White `#EDEEEF`
- **Text:** Black `#000000`
- **Display font:** Calibre Thin (48px)
- **Body font:** Calibre Light (16px)
- **Logo:** `public/brand/kinklink_logo.png`
- **Tailwind theme vars:** `--color-brand-{primary,secondary,accent,surface,text,white}`
<!-- END:brand-guidelines -->

<!-- BEGIN:code-review-learnings -->
## Code Review Self-Improvement

See `code-review-learnings.md` for lessons extracted from the Week 1 code review, covering:
- Security (service-role client, request validation)
- Error handling (try/catch, structured errors, UI feedback)
- TypeScript (NextAuth type extensions, no `any[]`)
- Next.js 16 conventions (NextRequest, async params)
- Brand consistency (UI primitives use brand tokens)
- UX states (loading, empty, error, inline edit feedback)
<!-- END:code-review-learnings -->
