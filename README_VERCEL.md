# Vercel deployment notes (SimplePay)

This repo contains:
- `backend/` (Express API)
- `frontend/` (CRA React app)
- `mobile/` (Expo app)

## Deploy frontend (CRA) to Vercel
1. Ensure the environment variable `REACT_APP_*` values (if any) are set in Vercel.
2. Link the repo in Vercel.
3. Vercel will run:
   - `npm run build --prefix frontend`
   - publish from `frontend/build`

`vercel.json` at the repo root configures the build/output.

## Deploy backend to Vercel
Current backend is Express/Node and is not directly deployable on Vercel without converting to:
- Next.js API routes, or
- Vercel Functions (API routes), with bundling.

Recommended: deploy backend to Render/Fly/Heroku, and keep Vercel for the frontend.

