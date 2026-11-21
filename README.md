# cyn-server

Backend API for **Cynosure MIS**, the B2B e-waste ERP and workflow system. It serves the staff portal (`service-app`) and, later, the customer portal (`customer-app`).

**Stack:** NestJS 12, TypeScript (ESM), MongoDB (Mongoose), JWT auth (Passport).

## Setup

Requires Node 22.22+ (or 24), [Yarn 1](https://classic.yarnpkg.com) and a reachable MongoDB.

```bash
yarn install
cp .env.example .env      # then fill in the values
yarn seed                 # development only: creates one test user per staff role
yarn dev
```

The API listens on the `PORT` from `.env` (default `4100`).

`.yarnrc` sets `ignore-engines true` because the Nest CLI's dependencies ask for Node 24.15+ and Yarn treats an engine mismatch as a hard error (npm only warned). Delete that line once the machine runs Node 24.15 or newer.

## Environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign login tokens (use a long random value) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `1d` |
| `PORT` | Port to listen on |
| `CORS_ORIGIN` | Comma-separated frontend origins allowed to call the API |
| `UPLOADS_DIR` | Folder for uploaded files (default `./uploads`) |

`.env` and `uploads/` are git-ignored. Never commit real credentials.

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Run with file watching |
| `yarn build` / `yarn start:prod` | Compile and run the production build |
| `yarn lint` | Lint with oxlint |
| `yarn format` | Format with Prettier |
| `yarn test` / `yarn test:e2e` | Unit / end-to-end tests (vitest) |
| `yarn seed` | Create development test users (`src/seed.ts`); never run against production |

## Structure

```
src/
  auth/            login, JWT strategy, role guards
  users/           user accounts
  customers/       customer records
  purchase-orders/ Module 1: PO registration, lifecycle status, dashboard summary
  inspections/     Module 2: onsite/virtual inspection, list import, photos
  quotations/      Module 3: pricing, signature, Admin approval, PDF generation
  files/           validated uploads and file storage
  audit/           who-did-what event log
  common/          shared enums and validation helpers
```

`assets/` holds files the server needs at runtime (the company logo printed on quotation PDFs). It is read from the working directory, so start the server from the `cyn-server` folder.

## Conventions

- **Relative imports end in `.js`** (NodeNext ESM), even though the files are `.ts`.
- Every `@Prop()` declares its `type` explicitly.
- A PO moves between stages only through `PurchaseOrdersService.transitionStatus`, which is atomic.
- Format with `yarn format` before committing.
