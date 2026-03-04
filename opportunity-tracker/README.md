# IEEE Opportunity Tracker
A full-stack web application designed for IEEE student members to discover competitions, paper contests, hackathons, and grants across 39 IEEE Societies and 8 Technical Councils.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js (Express -> Vercel Serverless Functions)
- Database: PostgreSQL (Neon) via Prisma
- AI Scraping: Cheerio API & Google Gemini 2.5 Flash

## Project Structure
This repository uses a monorepo structure configured for automated Vercel deployments.
- `/frontend` - Contains the React app
- `/backend` - Contains the Express APIs and Prisma bindings

## Required Environment Variables
You must set these in your local `.env` and in your Vercel project dashboard:
```env
NEON_DATABASE_URL="postgres://user:password@endpoint.neon.tech/neondb?sslmode=require"
GEMINI_API_KEY="AIzaSy..."
JWT_SECRET="your_secret"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="$2a$10$..."
VITE_API_URL="/api" # In Vercel, this should point to the domain root
```

## Local Development Setup

1. **Install Dependencies**
   Navigate to both `frontend` and `backend` and run `npm install`.

2. **Database Setup**
   Ensure `NEON_DATABASE_URL` is set in the `/opportunity-tracker` root `.env` or in the backend's `.env`.
   ```bash
   cd backend
   npx prisma generate
   npx prisma db push
   node prisma/seed.js
   ```

3. **Run Locally**
   - Start Backend: `cd backend && npm run dev` (Runs on `localhost:3000`)
   - Start Frontend: `cd frontend && npm run dev` (Runs on `localhost:5173`)
   *Note: Frontend vite.config.js automatically proxies `/api` to `localhost:3000`.*

## Deployment to Vercel

1. Push your monorepo code to a GitHub repository.
2. In Vercel, import the repository.
3. Configure the Root Directory to the base of the monorepo (where `vercel.json` exists).
4. Add all required Environment Variables into Vercel Project Settings.
5. Deploy! Vercel will automatically use `vercel.json` to build the static React frontend and configure the `api/` serverless functions.
