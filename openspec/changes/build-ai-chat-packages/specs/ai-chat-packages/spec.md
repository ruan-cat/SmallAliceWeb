## ADDED Requirements

### Requirement: 1. AI Vue mock chat component library

The system MUST provide `@ruan-cat-drill-doc/ai-vue` as a Vue 3 component library that exposes mock AI chat UI, a Vue plugin installer, typed message contracts, a reusable mock chat composable, and a public styles entry.

#### Scenario: Components can be consumed from the package entry

- **WHEN** a Vue application imports `AiChat`, `AiChatFloatingButton`, `useMockAiChat`, or the default plugin from `@ruan-cat-drill-doc/ai-vue`
- **THEN** the import SHALL resolve from the package public entry
- **AND** `app.use(AiVue)` SHALL register `AiChat` and `AiChatFloatingButton`
- **AND** the package SHALL expose `@ruan-cat-drill-doc/ai-vue/styles`

#### Scenario: Mock conversation runs without backend

- **WHEN** a user enters a message in `AiChat` and submits it
- **THEN** the component MUST append the user message
- **AND** the component MUST show a responding state
- **AND** the component MUST append a local mock assistant reply without calling a real API

### Requirement: 2. Nuxt documentation site for the AI Vue package

The system MUST provide `@ruan-cat-drill-doc/ai-vue-doc` as a Nuxt documentation site that demonstrates `@ruan-cat-drill-doc/ai-vue` in an SSR-capable documentation shell.

#### Scenario: Nuxt documentation can render the chat demo

- **WHEN** the Nuxt documentation site runs in dev, build, or preview mode
- **THEN** the site SHALL load `@ruan-cat-drill-doc/ai-vue` through workspace aliases
- **AND** the site SHALL display a documented `AiChat` demo
- **AND** the demo SHALL allow a user to send a mock message and receive a mock assistant reply

#### Scenario: Nuxt configuration follows the known compatible pattern

- **WHEN** the Nuxt documentation package is configured
- **THEN** `nuxt.config.ts` MUST extend `shadcn-docs-nuxt`
- **AND** `package.json` MUST include `predev`, `prebuild`, and `postinstall` scripts that run `nuxt prepare`
- **AND** `tailwind.config.js` MUST scan `../../node_modules/shadcn-docs-nuxt/**/*.{vue,js,ts,mjs}`
- **AND** SSR externalization settings SHALL cover the local AI package and UI dependency tree as needed

### Requirement: 3. VitePress client plugin integration

The system MUST provide `@ruan-cat-drill-doc/ai-vitepress-plugins` as a VitePress theme/client integration package that renders the AI chat launcher inside the root `@ruan-cat/drill-doc` VitePress site.

#### Scenario: Root VitePress site shows the AI launcher

- **WHEN** the root VitePress dev site starts
- **THEN** the site SHALL install the AI VitePress client plugin through the theme entry
- **AND** a circular AI launcher SHALL appear in the bottom-right corner
- **AND** clicking the launcher SHALL open a chat panel backed by `@ruan-cat-drill-doc/ai-vue`

#### Scenario: VitePress package exposes client entry points

- **WHEN** a VitePress theme imports from `@ruan-cat-drill-doc/ai-vitepress-plugins/client`
- **THEN** the package SHALL provide a Vue plugin install entry
- **AND** the package SHALL provide a `./client/style.css` export for shell-level styles
- **AND** the package SHALL keep AI component implementation in `@ruan-cat-drill-doc/ai-vue`

### Requirement: 4. SSR and client-only safety

The system MUST support Nuxt and VitePress SSR shell builds while keeping chat body behavior client-only for phase 1.

#### Scenario: Server build does not access browser globals

- **WHEN** Nuxt or VitePress performs an SSR build
- **THEN** top-level package modules MUST NOT access `window`, `document`, `localStorage`, `navigator`, or browser-only DOM state
- **AND** chat UI that depends on mounted browser state SHALL be guarded by `ClientOnly`, `onMounted`, or an equivalent client-only shell
- **AND** SSR build output SHALL NOT fail because of browser global access from the AI chat packages

### Requirement: 5. Phase 1 AI scope boundary

The system MUST keep phase 1 limited to a mock AI chat frontend shell and MUST NOT introduce real AI backend integration.

#### Scenario: Real AI integration is deferred

- **WHEN** implementation work for this change is reviewed
- **THEN** it MUST NOT include real LLM provider calls
- **AND** it MUST NOT add RAG retrieval, vector database access, Nitro API routes, LangGraph flows, `baseUrl`, API key, model name, or provider configuration
- **AND** any need for those capabilities SHALL be recorded as future OpenSpec work instead of being implemented in this change

### Requirement: 6. Verification evidence for the long task

The system MUST maintain resumable OpenSpec long-task evidence for implementation progress, validation results, failures, and known risks.

#### Scenario: Future agents can resume from files

- **WHEN** a later agent continues `build-ai-chat-packages`
- **THEN** `openspec/changes/build-ai-chat-packages/tasks.md` SHALL be the only executable task source
- **AND** `agent-progress.md` SHALL summarize the current checkpoint, files changed, validation evidence, and next step
- **AND** `agent-findings.md` SHALL summarize risks, failed paths, known exclusions, and decision boundaries
- **AND** no task SHALL be marked complete without verification evidence
