# IEEE Opportunity Tracker - System Documentation

This document serves as the comprehensive guide to the architecture, frameworks, and inner workings of the IEEE Opportunity Tracker application.

## Overview

The IEEE Opportunity Tracker is a full-stack, AI-powered web platform designed to automatically aggregate student competitions, paper contests, grants, hackathons, and fellowships from various IEEE Societies and Councils. It replaces the manual effort of checking dozens of separate websites by providing a centralized, searchable, and visually appealing feed.

## Technology Stack

The application uses a **Monorepo** structure optimized for serverless deployment on **Vercel**.

### Frontend (Client-Side)
- **Framework:** React.js (via Vite)
- **Language:** JavaScript
- **Styling:** Tailwind CSS (for rapid, utility-first styling) + customized IEEE brand colors (IEEE Blue, Navy, Gold).
- **Routing:** React Router DOM (for Multi-Page Application feel).
- **Icons:** Lucide React (clean, consistent SVG icons).
- **State Management:** React Hooks (`useState`, `useEffect`).
- **Data Fetching:** Axios.

### Backend (Server-Side)
- **Framework:** Node.js with Express.js.
- **Architecture:** Serverless Functions (Each API endpoint is executed statelessly on Vercel's Edge network).
- **Database:** PostgreSQL (Hosted on Neon.tech).
- **ORM (Object-Relational Mapping):** Prisma (for type-safe schema modeling and database migrations).
- **AI Processing:** Google Gemini API (`gemini-2.5-flash-lite` with fallback to `gemini-2.5-flash`).
- **Web Scraping:** Axios + Cheerio (for lightweight HTML DOM parsing).
- **Authentication:** JWT (JSON Web Tokens) for securing the Admin Panel.

## How It Works (The Core Loop)

The signature feature of this platform is the automated AI scraping backend.

### 1. Database Seed
The `Organization` table in the database is pre-seeded with 47 IEEE entities (39 technical societies, 8 technical councils, and IEEE headquarters). Each organization record has an `officialWebsite` and a targeted `scrapeUrl` (often a specific 'Student Resources' or 'Competitions' sub-page).

### 2. The Scraping Process (`/utils/scraper.js`)
When a scrape is triggered (either manually via the Admin Dashboard or via the automated "Scrape All" loop):

1. **HTML Fetching:** The backend uses `axios` to download the raw HTML of an organization's `scrapeUrl`. It uses custom User-Agents and header cloaking to avoid simple bot protections.
2. **Noise Reduction:** `cheerio` parses the HTML array. It deliberately strips out `nav`, `footer`, `script`, and `style` tags, extracting only pure, raw text strings from the `<body>`.
3. **Token Limiting:** The raw text is trimmed to a maximum of 12,000 characters to fit cleanly inside an AI context window without risking truncation timeouts or excessive token cost.
4. **AI Generation (Gemini):** The raw text is passed to Google's Gemini models with a strict, engineered prompt: *"Extract student competitions... Return ONLY a valid JSON array..."*.
5. **Fallback System:** The request hits the blazing fast `flash-lite` model first. If it fails, errors, or hallucinates bad JSON, it automatically falls back to the heavier `flash` model.

### 3. Data Upserting & Semantic Deduplication
Once Gemini returns structured JSON (title, deadline, type, description, etc.):
1. **Semantic Match:** The backend doesn't trust exact string matching because Gemini is non-deterministic (e.g., "Annual Design Contest" vs "Student Design Contest"). It runs a custom linguistic mathematically algorithm (`calculateSimilarity`) using **Word Subset Inclusion** combined with an intelligent exclusion of stop-words (like 'IEEE', 'Council', 'the', etc.).
2. **Upsert or Create:** If the semantic engine calculates a >50% word overlap with an existing DB entry, it updates the existing entry (Upsert) to prevent bloated duplicate rows. Otherwise, it creates a new entry.
3. **Auto-Closure Setup:** Any opportunity scraped with a `deadline` in the past is automatically assigned the `Closed` status in the DB, bypassing "Live" entirely.

## Admin Features

The site contains a highly protected `/admin` portal secured through JWT tokens. Passwords are hash-encrypted using `bcryptjs`.
1. **Direct Scrapes**: Admins can hit a 'Scrape' button next to any society to force an immediate Gemini fetch.
2. **Scrape All**: An automated programmatic UI loop that sequentially hits every organization. It enforces 2-second rate-limiting delays locally to respect Google Gemini quota limits and triggers individual separate API calls per society to cleanly bypass Vercel's strict 10-second serverless execution timeouts.
3. **Manual Entry Modal:** If a competition is hidden behind a PDF or dynamic React site that Cheerio can't scrape, admins can manually inject verified entries directly into the DB without using Gemini.

## Frontend UI Architecture

- **Dashboard:** Features aggregate stats (calculated natively via fast Prisma `SELECT COUNT` queries), dynamic React components, and a custom-built pure HTML5/JS `HeroGlobe` 3D animation mapping virtual connections.
- **Opportunities Feed:** The main explorer for users. It is deeply connected to filtering state and utilizes **Infinite Scroll Pagination**. Because there can be thousands of rows, the API limits results to 50 at a time, deterministically sorted by `deadline` and `id`, using React state to append new pages cleanly.
- **"Save For Later":** Uses physical browser `localStorage` isolated to the user's browser domain, allowing students to bookmark competitions without needing a formal user-account login system database.

## Deployment Strategy (Vercel)

The application handles monorepo complexity using a custom `vercel.json` rewrite engine.
Instead of spinning up a heavyweight full monolithic Node/Express server daemon (which is expensive and slow), Vercel natively carves the `api/index.js` Express file into highly-scalable, independent serverless/lambda functions triggered *only* when that specific route is pinged.

Client-side React routes are strictly caught by `"fallback": "frontend/dist/index.html"` to allow native browser SPA navigation to function.
