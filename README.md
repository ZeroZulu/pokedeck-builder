<p align="center">
  <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png" width="60" />
</p>

<h1 align="center">⚡ PokéDeck Builder</h1>

<p align="center">
  <strong>Build. Analyze. Dominate.</strong><br/>
  A free, real-time Pokémon TCG deck builder — no ads, no accounts, no nonsense.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/API-Live_Data-10b981?style=flat-square" />
  <img src="https://img.shields.io/badge/Cost-$0-f59e0b?style=flat-square" />
</p>

---

### 🔍 Search every card ever printed
20,000+ cards from every set — filterable by type, format, set, and supertype. New releases appear automatically via the live [Pokémon TCG API](https://pokemontcg.io).

### 🃏 Build decks that actually work
Click-to-add construction with TCG rule enforcement (60 cards, 4-copy limit, unlimited basic energy). Save locally, import/export in PTCGO format.

### 📊 Know your numbers
Real-time type distribution, HP curve, trainer breakdown, and validation — see exactly where your deck is strong and where it leaks.

### 🏆 Start from the meta
5 competitive archetypes with full 60-card lists, strategy tips, and one-click load into the builder. Skip the guesswork.

### 📱 Works everywhere
3-column desktop layout → tab-based mobile UI. No pinching, no scrolling sideways.

---

## Get Running

```bash
git clone https://github.com/YOUR_USERNAME/pokedeck-builder.git
cd pokedeck-builder
npm install
npm run dev
```

> **Optional:** Grab a free API key from [dev.pokemontcg.io](https://dev.pokemontcg.io), drop it in a `.env` file as `VITE_POKEMONTCG_API_KEY=your-key`, and go from 1K → 20K requests/day.

---

## Deploy (Free)

```bash
npm run build
npx vercel --prod    # or netlify, cloudflare pages, github pages
```

Zero cost. Zero backend. Just static files on a CDN.

---

## Under the Hood

`React 18` · `Vite 6` · `Pokémon TCG API` · `localStorage` · `AbortController` · `In-memory cache`

One file. ~950 lines. No external UI libraries. Every style is inline. Ship it anywhere.

---

<p align="center">
  <sub>Card data from <a href="https://pokemontcg.io">pokemontcg.io</a> · Pokémon is © Nintendo / The Pokémon Company</sub>
</p>
