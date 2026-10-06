# NewBridge quote demo

A Vite/React quote flow with a small Node.js API. The applicant form validates
the data in the browser; the API validates it again before estimating or creating
a demo quote.

## Run locally

```sh
npm install
npm run dev
```

The development command starts the web app and API together. Vite prints the
local web URL. Requests under `/api` are proxied to the Node API on port `3001`.
For a production run, use `npm run build` followed by `npm start`; the Node
server serves both the built frontend and API from one port.

## Deploy to Render

The included `render.yaml` configures a single Render web service. Push this
repository to GitHub, then in Render choose **New → Blueprint**, connect the
repository, and apply the `afficiency` service. Render builds the frontend,
starts the Node server, and uses `/api/health` for its health check. The
published `onrender.com` URL can be shared once the first deploy succeeds.

Demo quotes are stored in memory and are cleared when the service restarts.
Do not use this sample pricing or eligibility logic for real insurance quotes.

## API endpoints

- `GET /api/health` — API health check.
- `POST /api/eligibility` — validates applicant details and checks demo age and
  California ZIP eligibility before continuing.
- `POST /api/quotes/estimate` — validates applicant data and either calculates
  sample premiums for a coverage amount or finds the closest coverage for a
  target monthly premium.
- `POST /api/quotes` — validates, calculates, and creates an in-memory demo
  quote, returning a quote ID.
- `GET /api/quotes/:quoteId` — retrieves a quote created in the current API
  process.

The coverage range is `$1,000`–`$50,000` in `$1,000` increments. Monthly
premium mode accepts a target from `$1` to `$500` and finds the nearest
available `$1,000` coverage increment for each rate class. Premium math is
intentionally simple: coverage units times one fixed sample rate per `$1,000`.

| Rate class | Assumed monthly sample rate per `$1,000` | Maximum sample coverage |
| --- | ---: | ---: |
| Level Preferred | `$2.00` | `$50,000` |
| Level Non-Tobacco | `$3.00` | `$50,000` |
| Modified Non-Tobacco | `$4.50` | `$16,000` |

For example, `$4,000` at the Level Preferred sample rate is `4 × $2.00 =
$8.00/month`. Monthly prices are calculated in integer cents, and annual display
is twelve times the monthly estimate. The assumed rates and maximum coverage
are demo values, not approved product rules. Applicant attributes are validated
but do not change these illustrative prices or determine the selected rate
class.

Applicants must be age 50–85 and have a California ZIP code. The demo uses
`90001`–`96162` as a coarse California ZIP range; it is not a full USPS ZIP
directory. Replace this range with an authoritative ZIP-to-state lookup before
production use. Only Female and Male are offered in the demo gender field.

Optional riders, production underwriting, durable quote storage, authentication,
and carrier integrations are intentionally out of scope for this demo.

## Verify

```sh
npm test
npm run lint
npm run build
```
