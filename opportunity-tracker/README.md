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

## Environment Variables Configuration

The application requires several environment variables to function properly. **How you set these depends on where you are running the app.**

### 1. Local Development (`.env` files)
For local development, you should create `.env` files in your project. Do not commit these files to version control.

**In the root `opportunity-tracker/.env` AND `opportunity-tracker/backend/.env`:**
\`\`\`env
# PostgreSQL connection string from Neon (required for Prisma)
NEON_DATABASE_URL="postgres://user:password@endpoint.neon.tech/neondb?sslmode=require"

# Your Google Gemini API Key
GEMINI_API_KEY="AIzaSy..."

# Secret used to sign admin JWTs (can be any random string locally)
JWT_SECRET="your_secret_development_key"

# Admin login credentials
ADMIN_USERNAME="admin"
# bcrypt hash for "admin123" (or your preferred password)
ADMIN_PASSWORD_HASH="$2a$10$YourHashedPasswordHere..."
\`\`\`

**In `opportunity-tracker/frontend/.env`:**
\`\`\`env
# The URL for the backend API. 
# During local development with Vite server running on port 5173 and backend on try 3000:
VITE_API_URL="http://localhost:3000/api" 
\`\`\`

### 2. Vercel Deployment

When deploying to Vercel, **you do not use `.env` files.** Instead, you must add these variables directly in the Vercel Dashboard for your project.

1. Go to your project on Vercel -> **Settings** -> **Environment Variables**.
2. Add the following keys and their corresponding values (same as your local setup):
   - \`NEON_DATABASE_URL\`
   - \`GEMINI_API_KEY\`
   - \`JWT_SECRET\` (Use a strong, secure random string for production)
   - \`ADMIN_USERNAME\`
   - \`ADMIN_PASSWORD_HASH\`
3. **Important for Frontend:** Add the following key to let the React app know where the API is hosted in production:
   - \`VITE_API_URL\` = \`/api\`  *(Since Vercel serves the API on the same domain as the frontend, a relative path is required).*

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
