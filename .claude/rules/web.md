---
paths:
  - "**/apps/*-web/**"
  - "packages/ui/**"
  - "packages/tokens/**"
  - "storybook/**"
  - "**/messages/*.json"
---

# Web rules

These rules apply to every Next.js app and to the design system.

## Building pages

- Next.js with the App Router. Server components fetch on the server. Client components load data with TanStack Query through `openapi-react-query`, on the types generated from the API's `openapi.json`.
- State stays in React: state, context and the URL. There is no global store library.
- Requests go through the generated client with `openapi-fetch`. There is no axios.
- A form uses React Hook Form, validated by a Zod schema.
- The web app and its API share one origin: the API sits under `/api/v1` on the product's own address.

## The design system

- Every UI element comes from `@zigordev/ui`. Look for it there before building one. If it is missing, add it to the design system in its own pull request, with its story, and use the released version.
- An app component only composes design-system components with the app's data and logic. A component with no app data and no business logic belongs in the design system.
- App styles live in CSS Modules and use the tokens only: no raw colour, size or duration. There is no Tailwind and no CSS-in-JS. Fonts come from Fontsource packages.
- A component's stories are its browser tests. They pass in light and in dark, with no accessibility finding.

## Text and languages

- Every text exists in English and in Spanish, in `messages/en.json` and `messages/es.json`, with identical keys. A key that is missing or empty in one language fails `pnpm check`.
- Language tags are short: `en`, `es`.
- Copy is short and in sentence case, with no emoji and no exclamation mark. A button is a verb.
- Nothing fetches translations at runtime. A person who is not a developer changes a text in Fink, which opens a pull request.

## Quality

- WCAG 2.2 AA: keyboard access, visible focus, no axe finding, and `prefers-reduced-motion` respected.
- Core Web Vitals stay good: LCP up to 2.5 s, INP up to 200 ms and CLS up to 0.1.
- The content security policy is strict, with a nonce per request.
- Browser monitoring runs through `@zigordev/rum`. A new interaction joins the app's allow-list in the same pull request, and no personal data leaves the browser.
- The web app answers `GET /health` at the root, like every app.
