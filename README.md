# NewBridge Quote Demo

Full-stack quote-flow demo using React, Vite, and a Node.js API.

**Live demo:** [https://afficiency.onrender.com/](https://afficiency.onrender.com/)

## Run locally

```sh
npm install
npm run dev
```

Vite prints the local URL. To run a production build locally:

```sh
npm run build
npm start
```

## API

- `GET /api/health` — health check.
- `POST /api/eligibility` — validates applicant details and demo eligibility.
- `POST /api/quotes/estimate` — calculates sample premiums or coverage options.
- `POST /api/quotes` — creates an in-memory demo quote and returns its ID.
- `GET /api/quotes/:quoteId` — retrieves a quote during the current server run.

## Demo rules

Applicants must be age 50–85, use a California ZIP code, and select Female or
Male. ZIP eligibility uses a coarse `90001`–`96162` range.

Sample monthly rates per `$1,000` coverage are `$2.00` (Level Preferred),
`$3.00` (Level Non-Tobacco), and `$4.50` (Modified Non-Tobacco). Coverage is
available in `$1,000` increments; Modified Non-Tobacco is capped at `$16,000`.
Monthly premium mode finds the closest coverage amount. Annual display is
monthly premium × 12.

Pricing and eligibility are illustrative demo assumptions, not insurance
offers or approved product rules. Quotes are stored in memory and disappear
when the API restarts.
