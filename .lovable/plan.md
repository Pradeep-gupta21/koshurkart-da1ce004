## Goal
Add a top-level React error boundary that catches rendering errors and displays a user-friendly fallback UI with a "Reload" button instead of a blank page.

## Scope
- One new component: `src/components/ui/ErrorBoundary.tsx` (class component implementing `componentDidCatch`).
- One-line change in `src/main.tsx`: wrap `<App />` with the new boundary.
- No backend, routing, or style-system changes.

## Design
The fallback UI uses existing project tokens so it works in both light and dark mode:
- Centered card with `bg-card`, `text-card-foreground`, and `shadow-lg`.
- Decorative icon (`AlertTriangle` from `lucide-react`) in a soft red/primary tint.
- Heading: "Something went wrong"
- Subtext: brief apology + "If this keeps happening, please contact support."
- "Reload page" button using the existing shadcn `<Button>` component.
- A small technical details expandable section for the error stack (collapsed by default).

## Implementation Detail
```text
main.tsx
  └── <ErrorBoundary>
        └── <App />
```

`ErrorBoundary` state:
- `hasError: boolean`
- `error: Error | null`
- `errorInfo: React.ErrorInfo | null`

On catch, render the fallback card. "Reload" calls `window.location.reload()`.