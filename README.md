# LensSpace

LensSpace is a multi-tenant SaaS for optical stores. It manages the complete workflow from customers and prescriptions through sales, payments, production, notifications and delivery.

Preferred deployment: Vercel. Alternative: tf-easypanel-deploy with the Supabase path. AI, payments, email, PWA and n8n are optional and their dependencies are installed only when needed.

Requirements: Node.js 20.19.x, 22.13+ or 24+ and npm; verification used Node 24.8.0. Install with `npm ci` in the generated application, preserve its lockfile, configure the public Supabase URL/key via environment, and use:

```text
npm run dev
npm run lint
npm run typecheck
npm run build
```

ESLint runs independently from the Next.js build. This starter uses ESLint 10 with the official `@eslint/compat` bridge because some React/import rules bundled by eslint-config-next still use the old context API. npm currently emits peer-range warnings for those legacy plugins; the bridge fixes the observed runtime rule failure and the complete starter lint passes. Keep this limitation visible when updating the toolchain; do not blindly remove the bridge or force unrelated dependency upgrades. The lockfile records the verified resolution.

Tailwind remains version 3 with its matching `@tailwind` CSS directives and PostCSS configuration. No database, account or deployment is provisioned by copying this directory.

The toolkit's scaffold command rejects nonempty destinations. For existing applications, apply individual skills instead of copying this starter over the project.

## Shared AI agent setup

Project instructions, Titan Factory workflows, specialist roles, project skills and
the project memory are versioned with the repository for both Codex and Claude Code,
which share one memory under `.titan/`. See [docs/AGENT_SETUP.md](docs/AGENT_SETUP.md)
for teammate onboarding, skill restoration and the machine-local MCP authentication
step for each agent.

<!-- fullkod-signature -->
---

<a href="https://fullkod.com/?ref=lensspace"><img src="https://fullkod.com/brand/fullkod-symbol.svg" width="20" height="20" align="center" alt="Fullkod"></a> Built by **[Fullkod](https://fullkod.com/?ref=lensspace)**
