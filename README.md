# NFL Fantasy Box Pool

Season-long tiered fantasy contest. Pick one player from every tier
before the season, then watch. No lineups, no trades, no waivers.

## Running it locally

    npm install
    npm run dev

Needs a `.env` file in this folder:

    VITE_SUPABASE_URL=https://yourproject.supabase.co
    VITE_SUPABASE_ANON_KEY=your_anon_key

Both of these are public values. The anon key is designed to ship in
the browser bundle; Row Level Security in the database is what
protects the data. The service role key must never appear here.

## Deploying

Netlify builds from this repo. Settings live in `netlify.toml`, so
the only thing to configure in the Netlify UI is the two environment
variables above.

## Where everything else lives

Data loading and the weekly stat import are separate scripts in the
`nfl-box-pool` folder, not part of this app. They use the service
role key and run outside the browser.
