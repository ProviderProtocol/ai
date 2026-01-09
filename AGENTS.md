# Project Rules

1. **100% TypeScript** – No `any`, implicit types, or unchecked assumptions
2. **No library abstractions** – Use library APIs directly; never truncate/morph library data
3. **AirBnB style** – Follow AirBnB TypeScript/JavaScript conventions
4. **Zero lint/type errors** – `bun lint` and `bun typecheck` must pass
5. **Electron-first** – Desktop app; web security assumptions don't apply
6. **No re-exports** – Import library types directly; don't create barrel files
7. **No tooling suppressions** – No `eslint-disable`, `@ts-ignore`, etc.
8. **Shared UI components** – Reusable components for shared styling/views
9. **Small files** – Target ~300 LOC; refactor when beneficial
10. **Icon libraries only** – No custom inline SVGs
11. **Intentional testing** – Unit tests + live API tests; all tests must pass
12. **Persist atomic values only** – Compute derived fields (duration, netCost) at runtime
13. **Import management** - Do not re-export ever, the only allowed place is when it _FULLY MAKES SENSE_ to do so with index.ts files. 
14. **Commenting** - Avoid needless comments, if you make comments they should purely be documentational not inlined model reasoning. 
15. **Error Handling** - Prioritize pro-active error handling, use modern try catch patterns and be mindful of plausible error spots. 
16. **Add / Update Tests** - When making changes or adding functionality ensure you add and/or update both LIVE and UNIT tests. 

`.env` contains all AI provider keys.
> Be sure to use the LSP tool to help get / understand code. 
> Code documentation MUST use TSDoc style. 

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
