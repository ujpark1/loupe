# Loupe

> Hold your follow list — and X itself — up to a loupe.

**Loupe** lets you define a topic, set your own criteria for expertise in that topic, and then discovers the X accounts that actually meet those criteria — with cited evidence pulled from across the web (X, GitHub, Semantic Scholar, personal sites, web search).

This is the spiritual sequel to [Atrium](https://atrium-indol.vercel.app), which proved that _trust is per-(person, topic)_ but kept the criteria in editorial hands. Loupe inverts that: **the criteria are yours.**

See [`docs/PRD.md`](./docs/PRD.md) for the product specification.

## Stack
- Next.js 16 (App Router) + React 19 + Tailwind 4
- Anthropic Claude Sonnet 4.6 (extended thinking) for criteria generation + scoring
- Apify (`apidojo~tweet-scraper` and Twitter search) for X data
- Tavily for web search verification (optional — degrades gracefully)
- Semantic Scholar API for academic credentials (free, no key)
- GitHub REST API for code-shipping signals (free, optional auth)

## Setup
```bash
npm install
cp .env.example .env.local
# fill ANTHROPIC_API_KEY, APIFY_TOKEN; TAVILY_API_KEY optional
npm run dev
```
