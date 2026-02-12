import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Constants ───────────────────────────────────────────────────────
const API = "https://api.pokemontcg.io/v2";
const MAX_DECK = 60, MAX_COPIES = 4;
const BASIC_ENERGY = ["Grass Energy","Fire Energy","Water Energy","Lightning Energy","Psychic Energy","Fighting Energy","Darkness Energy","Metal Energy","Fairy Energy"];
const TC = {
  Grass:{bg:"#4CAF50",icon:"🌿"},Fire:{bg:"#F44336",icon:"🔥"},Water:{bg:"#2196F3",icon:"💧"},
  Lightning:{bg:"#FFC107",icon:"⚡"},Psychic:{bg:"#9C27B0",icon:"🔮"},Fighting:{bg:"#795548",icon:"✊"},
  Darkness:{bg:"#424242",icon:"🌙"},Metal:{bg:"#78909C",icon:"⚙️"},Dragon:{bg:"#FF9800",icon:"🐉"},
  Fairy:{bg:"#E91E63",icon:"✨"},Colorless:{bg:"#9E9E9E",icon:"⭐"},
};

function useDebounce(v, d) {
  const [dv, setDv] = useState(v);
  useEffect(() => { const t = setTimeout(() => setDv(v), d); return () => clearTimeout(t) }, [v, d]);
  return dv;
}

function useWindowSize() {
  const [size, setSize] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1200 });
  useEffect(() => {
    const h = () => setSize({ w: window.innerWidth });
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return size;
}

// Hardcoded types — these almost never change and avoids a rate-limited API call
const POKEMON_TYPES = ["Colorless","Darkness","Dragon","Fairy","Fighting","Fire","Grass","Lightning","Metal","Psychic","Water"];

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── API Service with caching ───────────────────────────────────────
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const SETS_CACHE_TTL = 24 * 60 * 60 * 1000;

// In production: use /ptcg-api/ path (Vercel rewrites to real API — same origin, no CORS)
// In development: call API directly
const IS_PROD = import.meta.env?.PROD;
const BASE_URL = IS_PROD ? "/ptcg-api" : API;
const API_KEY = import.meta.env?.VITE_POKEMONTCG_API_KEY;

if (IS_PROD) console.log("🔀 Using Vercel rewrite proxy (no CORS)");
else console.log("🔧 Dev mode — calling API directly");
if (API_KEY) console.log("✅ API key detected — 20,000 requests/day");

const svc = {
  async fetchWithRetry(url, signal, retries = 3, backoff = 1500) {
    for (let i = 0; i < retries; i++) {
      try {
        const opts = {};
        if (signal) opts.signal = signal;
        if (API_KEY) opts.headers = { 'X-Api-Key': API_KEY };
        const r = await fetch(url, opts);
        if (r.status === 429) {
          console.warn(`Rate limited, retry ${i + 1}/${retries} in ${backoff}ms`);
          await delay(backoff);
          backoff *= 2;
          continue;
        }
        if (r.status === 504) {
          console.warn(`Gateway timeout (504), retry ${i + 1}/${retries} in ${backoff}ms`);
          await delay(backoff);
          backoff *= 1.5;
          continue;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        if (i === retries - 1) throw err;
        await delay(backoff);
        backoff *= 2;
      }
    }
    throw new Error('Max retries reached');
  },

  async search(q, page = 1, ps = 20, signal) {
    const cacheKey = `${q}|${page}|${ps}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return cached.data;
    }

    // Only request fields we actually use — dramatically reduces response size & time
    const p = new URLSearchParams({
      page, pageSize: ps,
      orderBy: "-set.releaseDate",
      select: "id,name,supertype,subtypes,types,hp,images,set,legalities,evolvesFrom,evolvesTo,attacks,weaknesses,resistances,retreatCost,rarity"
    });
    if (q) p.set("q", q);
    const data = await this.fetchWithRetry(`${BASE_URL}/cards?${p}`, signal);

    searchCache.set(cacheKey, { data, time: Date.now() });
    if (searchCache.size > 100) {
      const oldest = [...searchCache.entries()].sort((a, b) => a[1].time - b[1].time)[0];
      searchCache.delete(oldest[0]);
    }

    return data;
  },

  async loadSets() {
    try {
      const stored = localStorage.getItem("ptcg-sets-cache");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.time < SETS_CACHE_TTL) {
          console.log(`Sets loaded from cache (${parsed.data.length} sets)`);
          return parsed.data;
        }
      }
    } catch {}

    const r = await this.fetchWithRetry(`${BASE_URL}/sets?orderBy=-releaseDate&pageSize=250`);
    const sets = r.data || [];

    try {
      localStorage.setItem("ptcg-sets-cache", JSON.stringify({ data: sets, time: Date.now() }));
    } catch {}

    console.log(`Sets loaded from API (${sets.length} sets)`);
    return sets;
  },

  buildQ({ name, type, supertype, set, legality }) {
    const p = [];
    if (name) p.push(`name:"${name}*"`); if (type) p.push(`types:${type}`);
    if (supertype) p.push(`supertype:${supertype}`); if (set) p.push(`set.id:${set}`);
    if (legality === "standard") p.push("legalities.standard:legal");
    if (legality === "expanded") p.push("legalities.expanded:legal");
    return p.join(" ");
  }
};

function analyze(deck) {
  const pk = deck.filter(c => c.supertype === "Pokémon"), tr = deck.filter(c => c.supertype === "Trainer"), en = deck.filter(c => c.supertype === "Energy");
  const typeD = {}; pk.forEach(c => (c.types || ["Colorless"]).forEach(t => { typeD[t] = (typeD[t] || 0) + 1 }));
  const hp = { low: 0, mid: 0, high: 0, vh: 0 };
  pk.forEach(c => { const h = parseInt(c.hp) || 0; if (h <= 70) hp.low++; else if (h <= 120) hp.mid++; else if (h <= 200) hp.high++; else hp.vh++ });
  const tb = { Item: 0, Supporter: 0, Stadium: 0, Tool: 0, Other: 0 };
  tr.forEach(c => { const s = (c.subtypes || [])[0]; if (tb[s] !== undefined) tb[s]++; else tb.Other++ });
  const issues = []; if (deck.length !== 60) issues.push(`${deck.length}/60 cards`);
  const nc = {}; deck.forEach(c => { nc[c.name] = (nc[c.name] || 0) + 1 });
  Object.entries(nc).forEach(([n, ct]) => { if (ct > MAX_COPIES && !BASIC_ENERGY.includes(n)) issues.push(`${n}: ${ct}× (max ${MAX_COPIES})`) });
  if (!pk.length) issues.push("No Pokémon"); if (!en.length && deck.length > 0) issues.push("No Energy");
  const avgHP = pk.length ? Math.round(pk.reduce((s, c) => s + (parseInt(c.hp) || 0), 0) / pk.length) : 0;
  return { total: deck.length, pk: pk.length, tr: tr.length, en: en.length, typeD, hp, tb, issues, avgHP, valid: deck.length === 60 && !issues.some(i => i.includes("max")) && pk.length > 0 };
}

const META = [
  {
    name: "Dragapult ex", tier: "S", type: "Psychic",
    desc: "Top-tier spread damage deck using Phantom Dive to soften multiple Pokémon, then clean up with powerful attacks. Extremely consistent with Pidgeot ex for search.",
    pokemon: [
      { name: "Dragapult ex", count: 2 }, { name: "Drakloak", count: 3 }, { name: "Dreepy", count: 4 },
      { name: "Pidgeot ex", count: 2 }, { name: "Pidgey", count: 2 }, { name: "Mew ex", count: 1 },
    ],
    trainers: [
      { name: "Professor's Research", count: 4 }, { name: "Iono", count: 3 }, { name: "Boss's Orders", count: 2 },
      { name: "Ultra Ball", count: 4 }, { name: "Nest Ball", count: 3 }, { name: "Rare Candy", count: 4 },
      { name: "Super Rod", count: 2 }, { name: "Switch", count: 2 }, { name: "Lost Vacuum", count: 1 },
      { name: "Forest Seal Stone", count: 1 }, { name: "Pal Pad", count: 1 },
    ],
    energy: [
      { name: "Psychic Energy", count: 8 }, { name: "Jet Energy", count: 2 },
    ],
    tips: "Set up Dragapult ex ASAP with Rare Candy. Use Phantom Dive every turn to stack damage. Pidgeot ex keeps your engine running.",
  },
  {
    name: "Gholdengo ex", tier: "S", type: "Metal",
    desc: "Self-sustaining draw engine via Gimmighoul's Coin Bonus ability. Gholdengo ex hits hard while maintaining hand size. Very consistent.",
    pokemon: [
      { name: "Gholdengo ex", count: 3 }, { name: "Gimmighoul", count: 4 },
      { name: "Mew ex", count: 1 }, { name: "Lumineon V", count: 1 },
    ],
    trainers: [
      { name: "Professor's Research", count: 4 }, { name: "Iono", count: 4 }, { name: "Boss's Orders", count: 3 },
      { name: "Ultra Ball", count: 4 }, { name: "Level Ball", count: 4 },
      { name: "Super Rod", count: 2 }, { name: "Switch", count: 2 }, { name: "Energy Recycler", count: 1 },
      { name: "Lost Vacuum", count: 1 }, { name: "Pal Pad", count: 1 },
    ],
    energy: [
      { name: "Metal Energy", count: 10 }, { name: "Jet Energy", count: 1 },
    ],
    tips: "Flood the bench with Gimmighoul early. Evolve into Gholdengo ex and use Make It Rain for big damage while drawing cards with Coin Bonus.",
  },
  {
    name: "Charizard ex", tier: "A", type: "Fire",
    desc: "Infernal Reign powers up your board fast. Pair with Pidgeot ex for consistent search every turn. Heavy hitter that's hard to one-shot.",
    pokemon: [
      { name: "Charizard ex", count: 3 }, { name: "Charmeleon", count: 1 }, { name: "Charmander", count: 4 },
      { name: "Pidgeot ex", count: 2 }, { name: "Pidgey", count: 2 },
      { name: "Manaphy", count: 1 }, { name: "Lumineon V", count: 1 },
    ],
    trainers: [
      { name: "Professor's Research", count: 3 }, { name: "Iono", count: 3 }, { name: "Boss's Orders", count: 2 },
      { name: "Arven", count: 2 },
      { name: "Ultra Ball", count: 4 }, { name: "Rare Candy", count: 4 }, { name: "Nest Ball", count: 2 },
      { name: "Super Rod", count: 2 }, { name: "Switch", count: 2 },
      { name: "Forest Seal Stone", count: 1 }, { name: "Lost Vacuum", count: 1 },
    ],
    energy: [
      { name: "Fire Energy", count: 12 },
    ],
    tips: "Rush Charizard ex with Rare Candy. Use Infernal Reign to attach energy to benched Pokémon. Pidgeot ex guarantees you find what you need every turn.",
  },
  {
    name: "Gardevoir ex", tier: "A", type: "Psychic",
    desc: "Psychic Embrace lets you attach Psychic Energy from discard to your Pokémon (at the cost of damage counters). Flexible attacker choices.",
    pokemon: [
      { name: "Gardevoir ex", count: 3 }, { name: "Kirlia", count: 4 }, { name: "Ralts", count: 4 },
      { name: "Scream Tail", count: 2 }, { name: "Mew ex", count: 1 }, { name: "Munkidori", count: 1 },
    ],
    trainers: [
      { name: "Professor's Research", count: 4 }, { name: "Iono", count: 3 }, { name: "Boss's Orders", count: 2 },
      { name: "Level Ball", count: 4 }, { name: "Ultra Ball", count: 2 }, { name: "Fog Crystal", count: 4 },
      { name: "Rare Candy", count: 3 }, { name: "Super Rod", count: 2 },
      { name: "Switch", count: 1 }, { name: "Pal Pad", count: 1 },
    ],
    energy: [
      { name: "Psychic Energy", count: 11 },
    ],
    tips: "Get multiple Kirlia on bench ASAP — they draw cards with Refinement. Use Psychic Embrace to fuel attackers from discard. Scream Tail hits hard as a single-prizer.",
  },
  {
    name: "Raging Bolt ex", tier: "A", type: "Lightning",
    desc: "Ancient Pokémon that deals massive damage scaling with energy. Pair with Ogerpon ex for energy acceleration.",
    pokemon: [
      { name: "Raging Bolt ex", count: 4 }, { name: "Ogerpon ex", count: 2 },
      { name: "Squawkabilly ex", count: 1 },
    ],
    trainers: [
      { name: "Professor's Research", count: 4 }, { name: "Iono", count: 4 }, { name: "Boss's Orders", count: 2 },
      { name: "Explorer's Guidance", count: 4 },
      { name: "Ultra Ball", count: 4 }, { name: "Nest Ball", count: 4 },
      { name: "Switch", count: 3 }, { name: "Super Rod", count: 2 },
      { name: "Maximum Belt", count: 2 }, { name: "Lost Vacuum", count: 1 },
      { name: "Pokéstop", count: 2 },
    ],
    energy: [
      { name: "Lightning Energy", count: 12 }, { name: "Grass Energy", count: 2 },
    ],
    tips: "Stack energy on Raging Bolt ex using Explorer's Guidance and Ogerpon ex. Each energy adds 70 damage. Maximum Belt helps hit KO thresholds on ex Pokémon.",
  },
];

// ═════════════════════════════════════════════════════════════════════
export default function App() {
  const { w } = useWindowSize();
  const isMobile = w < 768;
  const isTablet = w >= 768 && w < 1100;

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [fType, setFType] = useState("");
  const [fSuper, setFSuper] = useState("");
  const [fSet, setFSet] = useState("");
  const [fLeg, setFLeg] = useState("standard");
  const [sets, setSets] = useState([]);
  const [types, setTypes] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deck, setDeck] = useState([]);
  const [deckName, setDeckName] = useState("My Deck");
  const [savedDecks, setSavedDecks] = useState(() => { try { return JSON.parse(localStorage.getItem("ptcg-decks") || "[]") } catch { return [] } });
  const [modal, setModal] = useState(null);
  const [selCard, setSelCard] = useState(null);
  const [tab, setTab] = useState("search"); // search | meta
  const [mobileView, setMobileView] = useState("search"); // search | deck | stats
  const [importText, setImportText] = useState("");
  const [showFilters, setShowFilters] = useState(!isMobile);
  const [error, setError] = useState(null);
  const dn = useDebounce(searchName, 700);
  const gridRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("ptcg-decks", JSON.stringify(savedDecks)) } catch {} }, [savedDecks]);

  // Load types immediately (hardcoded), load sets from cache or API
  const [setsLoading, setSetsLoading] = useState(true);
  useEffect(() => {
    setTypes(POKEMON_TYPES);

    // Load sets — tries localStorage cache first, then API
    (async () => {
      try {
        const setsData = await svc.loadSets();
        setSets(setsData);
      } catch (err) {
        console.error("Failed to load sets:", err);
      } finally {
        setSetsLoading(false);
      }
    })();
  }, []);

  // AbortController ref — cancels in-flight search when filters change
  const abortRef = useRef(null);

  const doSearch = useCallback(async (pg = 1) => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true); setError(null);
    try {
      const q = svc.buildQ({ name: dn, type: fType, supertype: fSuper, set: fSet, legality: fLeg });
      const ps = isMobile ? 12 : 16;
      const r = await svc.search(q, pg, ps, controller.signal);
      // Only update state if this request wasn't aborted
      if (!controller.signal.aborted) {
        setCards(r.data || []); setTotalPages(Math.ceil((r.totalCount || 0) / ps)); setPage(pg);
        gridRef.current?.scrollTo(0, 0);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        const isTimeout = err.message?.includes('504') || err.message?.includes('timeout') || err.message?.includes('Max retries');
        setError(isTimeout
          ? "The API is responding slowly — this happens with broad filters. Try a more specific search or pick a different filter combo."
          : "Failed to fetch cards. You may be rate-limited — try again in a moment."
        );
        setCards([]);
      }
    }
    if (!controller.signal.aborted) setLoading(false);
  }, [dn, fType, fSuper, fSet, fLeg, isMobile]);

  useEffect(() => { doSearch(1) }, [doSearch]);

  const dCounts = useMemo(() => { const c = {}; deck.forEach(d => { c[d.name] = (c[d.name] || 0) + 1 }); return c }, [deck]);

  const addCard = useCallback(card => {
    if (deck.length >= MAX_DECK) return;
    if (!BASIC_ENERGY.includes(card.name) && (dCounts[card.name] || 0) >= MAX_COPIES) return;
    setDeck(p => [...p, card]);
  }, [deck.length, dCounts]);

  const removeCard = useCallback(card => {
    setDeck(p => { const i = p.findLastIndex(c => c.id === card.id); return i === -1 ? p : [...p.slice(0, i), ...p.slice(i + 1)] });
  }, []);

  const saveDeck = useCallback(() => {
    setSavedDecks(p => [{ name: deckName, cards: deck, date: new Date().toLocaleDateString() }, ...p]);
  }, [deckName, deck]);

  const exportText = useMemo(() => {
    const g = {}; deck.forEach(c => { if (!g[c.id]) g[c.id] = { card: c, count: 0 }; g[c.id].count++ });
    const sec = { "Pokémon": [], "Trainer": [], "Energy": [] };
    Object.values(g).forEach(({ card: c, count }) => {
      (sec[c.supertype] || sec["Trainer"]).push(`${count} ${c.name} ${c.set?.ptcgoCode || c.set?.id || ""} ${c.number || ""}`.trim());
    });
    return ["Pokémon", "Trainer", "Energy"].map(s => sec[s].length ? `${s}: ${sec[s].reduce((a, l) => a + parseInt(l), 0)}\n${sec[s].join("\n")}` : "").filter(Boolean).join("\n\n");
  }, [deck]);

  const handleImport = useCallback(async (text) => {
    const lines = text.split("\n").filter(l => l.trim()); const nd = [];
    for (const line of lines) {
      const m = line.match(/^(\d+)\s+(.+?)(?:\s+(\w+)\s+(\d+))?$/);
      if (m) { try { const r = await svc.search(`name:"${m[2].trim()}"`, 1, 1); if (r.data?.[0]) for (let i = 0; i < parseInt(m[1]); i++) nd.push(r.data[0]) } catch {} }
    }
    if (nd.length) setDeck(nd);
  }, []);

  const a = useMemo(() => analyze(deck), [deck]);
  const grouped = useMemo(() => {
    const g = { "Pokémon": {}, "Trainer": {}, "Energy": {} };
    deck.forEach(c => { const s = g[c.supertype] || g["Trainer"]; if (!s[c.id]) s[c.id] = { card: c, count: 0 }; s[c.id].count++ }); return g;
  }, [deck]);

  const quickSearch = n => { setSearchName(n); setTab("search"); if (isMobile) setMobileView("search") };

  // Meta deck loading
  const [metaLoading, setMetaLoading] = useState(null); // index of loading deck
  const [expandedMeta, setExpandedMeta] = useState(null); // index of expanded archetype

  const loadMetaDeck = useCallback(async (archetype, index) => {
    setMetaLoading(index);
    const allEntries = [...archetype.pokemon, ...archetype.trainers, ...archetype.energy];
    const newDeck = [];
    for (const entry of allEntries) {
      try {
        const r = await svc.search(`name:"${entry.name}"`, 1, 1);
        if (r.data?.[0]) {
          for (let i = 0; i < entry.count; i++) newDeck.push(r.data[0]);
        }
        // Small delay between requests to avoid rate limiting
        await delay(200);
      } catch (err) {
        console.warn(`Could not find: ${entry.name}`, err);
      }
    }
    if (newDeck.length > 0) {
      setDeck(newDeck);
      setDeckName(archetype.name);
      if (isMobile) setMobileView("deck");
    }
    setMetaLoading(null);
  }, [isMobile]);

  // ── Shared Styles ──
  const css = {
    input: { width: "100%", padding: isMobile ? "12px 14px" : "9px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "rgba(30,41,59,.8)", color: "#e2e8f0", fontSize: isMobile ? 16 : 14, outline: "none", boxSizing: "border-box", WebkitAppearance: "none" },
    select: { flex: 1, padding: isMobile ? "11px 10px" : "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "rgba(30,41,59,.8)", color: "#e2e8f0", fontSize: isMobile ? 15 : 12, outline: "none", minWidth: 0, WebkitAppearance: "none" },
    btn: (bg, color, border) => ({ padding: isMobile ? "10px 16px" : "7px 14px", borderRadius: 8, background: bg, color, fontSize: isMobile ? 14 : 13, fontWeight: 600, border: border || "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit", transition: "all .2s", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }),
    badge: (c) => ({ padding: "3px 10px", borderRadius: 16, fontSize: 11, fontWeight: 600, background: `${c}18`, color: c, border: `1px solid ${c}30` }),
    sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#64748b" },
  };

  // ── Render Functions ──
  const renderSearch = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Tab toggle: Search vs Meta */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(15,23,42,.6)", flexShrink: 0 }}>
        <span style={css.sectionTitle}>Card Database</span>
        <div style={{ display: "flex", gap: 6 }}>
          {["search", "meta"].map(t => (
            <span key={t} onClick={() => setTab(t)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: tab === t ? "1px solid #22d3ee" : "1px solid rgba(255,255,255,.1)", background: tab === t ? "rgba(34,211,238,.12)" : "transparent", color: tab === t ? "#22d3ee" : "#64748b", cursor: "pointer", textTransform: "capitalize", WebkitTapHighlightColor: "transparent" }}>{t}</span>
          ))}
        </div>
      </div>

      {tab === "search" ? (
        <>
          {/* Search + Filters */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
            <input style={css.input} placeholder="Search cards by name..." value={searchName} onChange={e => setSearchName(e.target.value)} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button onClick={() => setShowFilters(p => !p)} style={{ ...css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)"), fontSize: 12, padding: "6px 12px" }}>
                🔽 Filters {showFilters ? "▲" : "▼"}
              </button>
              {(fType || fSuper || fSet || fLeg !== "standard") && (
                <button onClick={() => { setFType(""); setFSuper(""); setFSet(""); setFLeg("standard") }} style={{ fontSize: 12, color: "#f87171", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Clear filters</button>
              )}
            </div>
            {showFilters && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, animation: "fadeUp .2s ease" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={css.select} value={fType} onChange={e => setFType(e.target.value)}>
                    <option value="">All Types</option>
                    {types.map(t => <option key={t} value={t}>{TC[t]?.icon || ""} {t}</option>)}
                  </select>
                  <select style={css.select} value={fSuper} onChange={e => setFSuper(e.target.value)}>
                    <option value="">All Cards</option>
                    {["Pokémon", "Trainer", "Energy"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={css.select} value={fSet} onChange={e => setFSet(e.target.value)}>
                    <option value="">{setsLoading ? "Loading sets..." : "All Sets"}</option>
                    {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select style={css.select} value={fLeg} onChange={e => setFLeg(e.target.value)}>
                    <option value="">Any Format</option>
                    <option value="standard">Standard</option>
                    <option value="expanded">Expanded</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Card Grid */}
          <div ref={gridRef} style={{ flex: 1, overflow: "auto", padding: isMobile ? 10 : 14, display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fill,minmax(100px,1fr))" : isTablet ? "repeat(auto-fill,minmax(110px,1fr))" : "repeat(auto-fill,minmax(120px,1fr))", gap: isMobile ? 8 : 10, alignContent: "start", WebkitOverflowScrolling: "touch" }}>
            {loading ? (
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", alignItems: "center", padding: 40, color: "#475569" }}>
                <div style={{ display: "flex", gap: 8 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#22d3ee", animation: `pulse 1.2s ease ${i * .2}s infinite` }} />)}</div>
                <div style={{ marginTop: 10, fontSize: 13 }}>Searching...</div>
              </div>
            ) : error ? (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 30, color: "#fca5a5" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{error}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                  <button onClick={() => doSearch(1)} style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(34,211,238,.12)", color: "#22d3ee", border: "1px solid rgba(34,211,238,.25)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>🔄 Retry</button>
                  <button onClick={() => { setFType(""); setFSuper(""); setFSet(""); setFLeg("standard"); setSearchName("") }} style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(255,255,255,.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,.1)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Reset Filters</button>
                </div>
              </div>
            ) : cards.length === 0 ? (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#475569" }}><div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>No cards found</div>
            ) : cards.map(card => {
              const inD = !!dCounts[card.name];
              return (
                <div key={card.id} onClick={() => setSelCard(card)} style={{ borderRadius: 10, overflow: "hidden", cursor: "pointer", border: inD ? "2px solid rgba(34,211,238,.5)" : "2px solid transparent", opacity: inD ? .75 : 1, aspectRatio: "63/88", position: "relative", transition: "transform .15s, box-shadow .15s", WebkitTapHighlightColor: "transparent" }}>
                  <img src={card.images?.small} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                  {inD && <div style={{ position: "absolute", top: 3, right: 3, background: "rgba(34,211,238,.9)", color: "#0f172a", borderRadius: 5, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>×{dCounts[card.name]}</div>}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, padding: isMobile ? "10px 16px" : "10px 16px", borderTop: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
              <button style={{ ...css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)"), opacity: page <= 1 ? .3 : 1 }} disabled={page <= 1} onClick={() => doSearch(page - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{page}/{totalPages}</span>
              <button style={{ ...css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)"), opacity: page >= totalPages ? .3 : 1 }} disabled={page >= totalPages} onClick={() => doSearch(page + 1)}>Next →</button>
            </div>
          )}
        </>
      ) : (
        /* Meta Tab */
        <div style={{ flex: 1, overflow: "auto", padding: 16, WebkitOverflowScrolling: "touch" }}>
          <div style={{ ...css.sectionTitle, marginBottom: 12 }}>🏆 Meta Archetypes (Current Format)</div>
          {META.map((m, i) => {
            const tc = TC[m.type] || TC.Colorless;
            const isExpanded = expandedMeta === i;
            const isLoading = metaLoading === i;
            const totalCards = [...m.pokemon, ...m.trainers, ...m.energy].reduce((s, e) => s + e.count, 0);
            return (
              <div key={i} style={{ borderRadius: 12, background: "rgba(255,255,255,.03)", border: isExpanded ? "1px solid rgba(34,211,238,.25)" : "1px solid rgba(255,255,255,.06)", marginBottom: 10, overflow: "hidden", transition: "border-color .2s" }}>
                {/* Header — always visible */}
                <div onClick={() => setExpandedMeta(isExpanded ? null : i)} style={{ padding: "14px 16px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{tc.icon} {m.name}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={css.badge(m.tier === "S" ? "#eab308" : "#22d3ee")}>Tier {m.tier}</span>
                      <span style={{ fontSize: 12, color: "#475569" }}>{totalCards} cards</span>
                      <span style={{ fontSize: 14, color: "#475569", transition: "transform .2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{m.desc}</div>
                </div>

                {/* Expanded deck list */}
                {isExpanded && (
                  <div style={{ padding: "0 16px 16px", animation: "fadeUp .2s ease" }}>
                    {/* Deck list sections */}
                    {[
                      { title: "Pokémon", items: m.pokemon, color: "#22d3ee", total: m.pokemon.reduce((s, e) => s + e.count, 0) },
                      { title: "Trainers", items: m.trainers, color: "#a78bfa", total: m.trainers.reduce((s, e) => s + e.count, 0) },
                      { title: "Energy", items: m.energy, color: "#fbbf24", total: m.energy.reduce((s, e) => s + e.count, 0) },
                    ].map(section => (
                      <div key={section.title} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: section.color, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                          <span>{section.title}</span>
                          <span>{section.total}</span>
                        </div>
                        {section.items.map((entry, j) => (
                          <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderRadius: 6, marginBottom: 2 }}>
                            <span onClick={() => quickSearch(entry.name)} style={{ fontSize: 13, color: "#cbd5e1", cursor: "pointer", borderBottom: "1px dotted rgba(255,255,255,.15)" }}>{entry.name}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: section.color, minWidth: 24, textAlign: "right" }}>×{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    ))}

                    {/* Strategy tips */}
                    {m.tips && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(167,139,250,.06)", border: "1px solid rgba(167,139,250,.12)", marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>💡 Strategy</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{m.tips}</div>
                      </div>
                    )}

                    {/* Load deck button */}
                    <button
                      onClick={() => loadMetaDeck(m, i)}
                      disabled={isLoading}
                      style={{
                        ...css.btn(
                          isLoading ? "rgba(255,255,255,.06)" : "linear-gradient(135deg,#ef4444,#f97316)",
                          isLoading ? "#64748b" : "white"
                        ),
                        width: "100%", justifyContent: "center", padding: isMobile ? "12px 16px" : "10px 16px",
                        fontSize: 14, fontWeight: 700, borderRadius: 10,
                        cursor: isLoading ? "wait" : "pointer",
                      }}
                    >
                      {isLoading ? (
                        <><span style={{ display: "inline-flex", gap: 4 }}>{[0,1,2].map(d => <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "#64748b", animation: `pulse 1s ease ${d*.2}s infinite` }}/>)}</span> Loading deck...</>
                      ) : (
                        <>🚀 Load This Deck into Builder</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: "rgba(34,211,238,.04)", border: "1px solid rgba(34,211,238,.12)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#22d3ee", marginBottom: 6 }}>🔄 Auto-Updating</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>New sets and cards appear automatically via the live Pokémon TCG API. No manual updates needed!</div>
          </div>
        </div>
      )}
    </div>
  );

  const renderDeck = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(15,23,42,.5)", flexShrink: 0, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <input style={{ ...css.input, fontSize: isMobile ? 15 : 14, fontWeight: 700, padding: "6px 12px", maxWidth: isMobile ? 140 : 180 }} value={deckName} onChange={e => setDeckName(e.target.value)} />
          <span style={{ ...css.badge(a.total === 60 ? "#10b981" : a.total > 60 ? "#ef4444" : "#eab308"), fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{a.total}/60</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button style={css.btn("rgba(239,68,68,.1)", "#fca5a5", "1px solid rgba(239,68,68,.2)")} onClick={() => setDeck([])}>🗑️</button>
          <button style={css.btn("linear-gradient(135deg,#ef4444,#f97316)", "white")} onClick={saveDeck}>💾</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? 12 : 16, WebkitOverflowScrolling: "touch" }}>
        {deck.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#475569", textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🃏</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Start Building</div>
            <div style={{ fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>
              {isMobile ? "Tap the Search tab to find cards and add them to your deck." : "Search for cards on the left and click to add them."}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {[["📌", "Max 4 copies", "#22d3ee"], ["♾️", "∞ Basic Energy", "#a78bfa"], ["🎯", "60 cards", "#10b981"]].map(([ico, txt, c]) => (
                <div key={txt} style={{ padding: "8px 12px", borderRadius: 8, background: `${c}0a`, border: `1px solid ${c}20`, fontSize: 12, color: c }}>{ico} {txt}</div>
              ))}
            </div>
          </div>
        ) : (
          ["Pokémon", "Trainer", "Energy"].map(st => {
            const entries = Object.values(grouped[st]); if (!entries.length) return null;
            const cnt = entries.reduce((s, e) => s + e.count, 0);
            return (
              <div key={st} style={{ marginBottom: 14 }}>
                <div style={{ ...css.sectionTitle, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>{st}</span><span style={{ color: "#22d3ee" }}>{cnt}</span>
                </div>
                {entries.map(({ card, count }) => {
                  const tc = TC[card.types?.[0]] || TC.Colorless;
                  const isB = BASIC_ENERGY.includes(card.name), atMax = !isB && count >= MAX_COPIES;
                  return (
                    <div key={card.id} style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 8, padding: isMobile ? "8px 10px" : "5px 10px", borderRadius: 8, background: "rgba(30,41,59,.35)", marginBottom: 3 }}>
                      <img src={card.images?.small} alt="" style={{ width: isMobile ? 36 : 30, height: isMobile ? 50 : 42, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} onClick={() => setSelCard(card)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</div>
                        <div style={{ fontSize: isMobile ? 11 : 10, color: "#475569" }}>{card.set?.name}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => removeCard(card)} style={{ width: isMobile ? 34 : 24, height: isMobile ? 34 : 24, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(30,41,59,.8)", color: "#94a3b8", fontSize: isMobile ? 18 : 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>−</button>
                        <span style={{ fontWeight: 700, fontSize: isMobile ? 16 : 14, minWidth: 20, textAlign: "center", color: tc.bg }}>{count}</span>
                        <button onClick={() => !atMax && addCard(card)} style={{ width: isMobile ? 34 : 24, height: isMobile ? 34 : 24, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(30,41,59,.8)", color: "#94a3b8", fontSize: isMobile ? 18 : 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: atMax ? "not-allowed" : "pointer", opacity: atMax ? .3 : 1, WebkitTapHighlightColor: "transparent" }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Quick Actions Bar (mobile) */}
      {isMobile && deck.length > 0 && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", gap: 6, flexShrink: 0, background: "rgba(15,23,42,.6)" }}>
          <button style={{ ...css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)"), flex: 1, justifyContent: "center" }} onClick={() => setModal("export")}>📤 Export</button>
          <button style={{ ...css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)"), flex: 1, justifyContent: "center" }} onClick={() => setModal("import")}>📥 Import</button>
          <button style={{ ...css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)"), flex: 1, justifyContent: "center" }} onClick={() => setModal("saved")}>📂 Saved</button>
        </div>
      )}
    </div>
  );

  const renderStats = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(15,23,42,.6)", flexShrink: 0 }}>
        <span style={css.sectionTitle}>Deck Analytics</span>
        {a.valid && <span style={{ ...css.badge("#4ade80"), fontWeight: 700 }}>✓ Valid</span>}
      </div>

      <div style={{ padding: isMobile ? 12 : 16 }}>
        {/* Composition */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...css.sectionTitle, marginBottom: 10 }}>Composition</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[{ l: "Pokémon", v: a.pk, c: "#22d3ee", i: "🔵" }, { l: "Trainers", v: a.tr, c: "#a78bfa", i: "🟣" }, { l: "Energy", v: a.en, c: "#fbbf24", i: "🟡" }].map(x => (
              <div key={x.l} style={{ textAlign: "center", padding: isMobile ? "12px 0" : "10px 0", borderRadius: 10, background: "rgba(255,255,255,.03)" }}>
                <div style={{ fontSize: isMobile ? 20 : 16, marginBottom: 2 }}>{x.i}</div>
                <div style={{ fontSize: isMobile ? 26 : 22, fontWeight: 800, color: x.c }}>{x.v}</div>
                <div style={{ fontSize: isMobile ? 11 : 10, color: "#475569" }}>{x.l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "#64748b" }}>Progress</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: a.total === 60 ? "#10b981" : "#94a3b8" }}>{Math.round(a.total / 60 * 100)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, width: `${Math.min(a.total / 60 * 100, 100)}%`, background: a.total === 60 ? "#10b981" : a.total > 60 ? "#ef4444" : "linear-gradient(90deg,#22d3ee,#3b82f6)", transition: "width .4s" }} />
            </div>
          </div>
        </div>

        {/* Type Distribution */}
        {Object.keys(a.typeD).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...css.sectionTitle, marginBottom: 10 }}>Type Distribution</div>
            {Object.entries(a.typeD).sort((x, y) => y[1] - x[1]).map(([t, c]) => {
              const tc = TC[t] || TC.Colorless, mx = Math.max(...Object.values(a.typeD), 1);
              return (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, width: 22 }}>{tc.icon}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", width: 60 }}>{t}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: tc.bg, width: `${(c / mx) * 100}%`, transition: "width .4s" }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: tc.bg, width: 20, textAlign: "right" }}>{c}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Trainer Breakdown */}
        {a.tr > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...css.sectionTitle, marginBottom: 10 }}>Trainer Breakdown</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(a.tb).filter(([, v]) => v > 0).map(([t, v]) => (
                <span key={t} style={css.badge("#a78bfa")}>{t}: {v}</span>
              ))}
            </div>
          </div>
        )}

        {/* HP Curve */}
        {a.pk > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...css.sectionTitle, marginBottom: 10 }}>HP Curve · Avg {a.avgHP}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "end", height: 70 }}>
              {[{ l: "≤70", v: a.hp.low, c: "#10b981" }, { l: "71-120", v: a.hp.mid, c: "#22d3ee" }, { l: "121-200", v: a.hp.high, c: "#f97316" }, { l: "200+", v: a.hp.vh, c: "#ef4444" }].map(x => {
                const mx = Math.max(a.hp.low, a.hp.mid, a.hp.high, a.hp.vh, 1);
                return (
                  <div key={x.l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: x.c }}>{x.v}</span>
                    <div style={{ width: "100%", borderRadius: 4, background: x.c, height: `${Math.max((x.v / mx) * 45, 4)}px`, transition: "height .4s" }} />
                    <span style={{ fontSize: 10, color: "#475569" }}>{x.l}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Issues */}
        {a.issues.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...css.sectionTitle, marginBottom: 10 }}>⚠️ Issues</div>
            {a.issues.map((iss, i) => (
              <div key={i} style={{ display: "flex", alignItems: "start", gap: 6, padding: "8px 10px", borderRadius: 8, background: "rgba(239,68,68,.06)", marginBottom: 4, fontSize: 12, color: "#fca5a5", border: "1px solid rgba(239,68,68,.12)" }}>
                <span>⚠</span><span>{iss}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ ...css.sectionTitle, marginBottom: 6 }}>💡 Building Tips</div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>Balanced competitive deck: 12-20 Pokémon, 25-35 Trainers, 8-14 Energy. Run 4× key cards for consistency.</div>
        </div>
      </div>
    </div>
  );

  // ── Modal Backdrop ──
  const Overlay = ({ children, onClose }) => (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: isMobile ? 12 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1e293b", borderRadius: isMobile ? 14 : 16, padding: isMobile ? 18 : 24, width: "100%", maxWidth: isMobile ? "100%" : 680, maxHeight: isMobile ? "92vh" : "85vh", overflow: "auto", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 20px 60px rgba(0,0,0,.5)", WebkitOverflowScrolling: "touch" }}>
        {children}
      </div>
    </div>
  );

  const ModalHeader = ({ title, onClose }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <h3 style={{ fontSize: isMobile ? 18 : 17, fontWeight: 700, margin: 0 }}>{title}</h3>
      <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "rgba(255,255,255,.06)", color: "#64748b", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans',system-ui,sans-serif", background: "linear-gradient(135deg,#0a0e1a,#111827,#0f172a)", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{height:100%;overflow:hidden}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        input,select,textarea{font-family:inherit}
        input[type="text"],input:not([type]),textarea{font-size:16px} /* prevent iOS zoom */
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ padding: isMobile ? "10px 14px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,.06)", background: "rgba(15,23,42,.8)", flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 12 }}>
          <div style={{ width: isMobile ? 34 : 40, height: isMobile ? 34 : 40, borderRadius: isMobile ? 8 : 10, background: "linear-gradient(135deg,#ef4444,#f97316,#eab308)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 16 : 20, color: "white", boxShadow: "0 4px 16px rgba(239,68,68,.3)", flexShrink: 0 }}>⚡</div>
          <div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, letterSpacing: "-.02em" }}>PokéDeck Builder</div>
            {!isMobile && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500, letterSpacing: ".05em", textTransform: "uppercase" }}>TCG Deck Construction Tool</div>}
          </div>
        </div>
        {!isMobile && (
          <div style={{ display: "flex", gap: 6 }}>
            <button style={css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)")} onClick={() => setModal("saved")}>📂 Saved ({savedDecks.length})</button>
            <button style={css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)")} onClick={() => setModal("export")}>📤 Export</button>
            <button style={css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)")} onClick={() => setModal("import")}>📥 Import</button>
            <button style={css.btn("linear-gradient(135deg,#ef4444,#f97316)", "white")} onClick={saveDeck}>💾 Save Deck</button>
          </div>
        )}
      </header>

      {/* ── MAIN CONTENT ── */}
      {isMobile ? (
        /* ─ MOBILE: Tab-based single panel ─ */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {mobileView === "search" && renderSearch()}
            {mobileView === "deck" && renderDeck()}
            {mobileView === "stats" && renderStats()}
          </div>

          {/* Bottom Tab Bar */}
          <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.95)", backdropFilter: "blur(12px)", flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            {[
              { id: "search", icon: "🔍", label: "Search" },
              { id: "deck", icon: "🃏", label: "Deck", badge: a.total > 0 ? a.total : null },
              { id: "stats", icon: "📊", label: "Stats" },
            ].map(t => (
              <button key={t.id} onClick={() => setMobileView(t.id)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: "10px 0 8px", background: "none", border: "none",
                color: mobileView === t.id ? "#22d3ee" : "#64748b",
                fontSize: 10, fontWeight: 600, cursor: "pointer", position: "relative",
                fontFamily: "inherit", WebkitTapHighlightColor: "transparent",
                borderTop: mobileView === t.id ? "2px solid #22d3ee" : "2px solid transparent",
                transition: "all .15s",
              }}>
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                <span>{t.label}</span>
                {t.badge && (
                  <span style={{ position: "absolute", top: 4, right: "25%", background: a.total === 60 ? "#10b981" : "#ef4444", color: "white", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{t.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ─ DESKTOP/TABLET: Multi-column layout ─ */
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: isTablet ? "340px 1fr" : "380px 1fr 330px", overflow: "hidden" }}>
          <div style={{ borderRight: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
            {renderSearch()}
          </div>
          <div style={{ overflow: "hidden" }}>
            {renderDeck()}
          </div>
          {!isTablet && (
            <div style={{ borderLeft: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
              {renderStats()}
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Card Detail */}
      {selCard && (
        <Overlay onClose={() => setSelCard(null)}>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 24 }}>
            <div style={{ flex: isMobile ? "none" : "0 0 200px", display: "flex", justifyContent: "center" }}>
              <img src={selCard.images?.large || selCard.images?.small} alt={selCard.name} style={{ width: isMobile ? "60%" : "100%", maxWidth: 240, borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.4)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, margin: 0 }}>{selCard.name}</h2>
                <button onClick={() => setSelCard(null)} style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "rgba(255,255,255,.06)", color: "#64748b", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {(selCard.types || [selCard.supertype]).map((t, i) => { const tc = TC[t] || TC.Colorless; return <span key={i} style={css.badge(tc.bg)}>{tc.icon} {t}</span> })}
                {selCard.hp && <span style={css.badge("#22d3ee")}>HP {selCard.hp}</span>}
                {selCard.rarity && <span style={css.badge("#a78bfa")}>{selCard.rarity}</span>}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>{selCard.set?.name} · {selCard.number}/{selCard.set?.printedTotal} · {selCard.supertype} {selCard.subtypes?.join(" ")}</div>
              {selCard.abilities?.map((ab, i) => (
                <div key={i} style={{ marginBottom: 8, padding: 10, borderRadius: 8, background: "rgba(167,139,250,.06)", border: "1px solid rgba(167,139,250,.12)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", marginBottom: 3 }}>✦ {ab.type}: {ab.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{ab.text}</div>
                </div>
              ))}
              {selCard.attacks?.map((at, i) => (
                <div key={i} style={{ marginBottom: 6, padding: 10, borderRadius: 8, background: "rgba(255,255,255,.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{at.cost?.map((c, j) => <span key={j}>{TC[c]?.icon || "⭐"}</span>)} {at.name}</span>
                    {at.damage && <span style={{ fontSize: 15, fontWeight: 800, color: "#f97316" }}>{at.damage}</span>}
                  </div>
                  {at.text && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, lineHeight: 1.5 }}>{at.text}</div>}
                </div>
              ))}
              {selCard.rules?.map((r, i) => <div key={i} style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontStyle: "italic", lineHeight: 1.5 }}>{r}</div>)}
              <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {(() => {
                  const cnt = dCounts[selCard.name] || 0, isB = BASIC_ENERGY.includes(selCard.name), atMax = !isB && cnt >= MAX_COPIES, full = deck.length >= MAX_DECK;
                  return <button style={{ ...css.btn(atMax || full ? "rgba(255,255,255,.06)" : "linear-gradient(135deg,#ef4444,#f97316)", atMax || full ? "#475569" : "white"), cursor: atMax || full ? "not-allowed" : "pointer" }} onClick={() => { if (!atMax && !full) addCard(selCard) }}>➕ Add{cnt > 0 ? ` (${cnt}/${isB ? "∞" : MAX_COPIES})` : ""}</button>;
                })()}
                {selCard.legalities && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {selCard.legalities.standard && <span style={css.badge(selCard.legalities.standard === "Legal" ? "#10b981" : "#ef4444")}>Standard</span>}
                    {selCard.legalities.expanded && <span style={css.badge(selCard.legalities.expanded === "Legal" ? "#10b981" : "#ef4444")}>Expanded</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Overlay>
      )}

      {/* Export */}
      {modal === "export" && (
        <Overlay onClose={() => setModal(null)}>
          <ModalHeader title="📤 Export Deck" onClose={() => setModal(null)} />
          <textarea readOnly value={exportText} style={{ width: "100%", minHeight: isMobile ? 180 : 200, padding: 14, borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e2e8f0", fontSize: 13, fontFamily: "'SF Mono',monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          <div style={{ marginTop: 12 }}>
            <button style={css.btn("linear-gradient(135deg,#ef4444,#f97316)", "white")} onClick={() => navigator.clipboard?.writeText(exportText)}>📋 Copy to Clipboard</button>
          </div>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 10 }}>Compatible with PTCGO/PTCGL.</p>
        </Overlay>
      )}

      {/* Import */}
      {modal === "import" && (
        <Overlay onClose={() => setModal(null)}>
          <ModalHeader title="📥 Import Deck" onClose={() => setModal(null)} />
          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Paste a deck list:</p>
          <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder={"Pokémon: 20\n4 Charizard ex OBF 125\n..."} style={{ width: "100%", minHeight: isMobile ? 180 : 200, padding: 14, borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "rgba(15,23,42,.8)", color: "#e2e8f0", fontSize: 13, fontFamily: "'SF Mono',monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          <div style={{ marginTop: 12 }}>
            <button style={css.btn("linear-gradient(135deg,#10b981,#059669)", "white")} onClick={() => { handleImport(importText); setModal(null) }}>⬇️ Import</button>
          </div>
        </Overlay>
      )}

      {/* Saved Decks */}
      {modal === "saved" && (
        <Overlay onClose={() => setModal(null)}>
          <ModalHeader title="📂 Saved Decks" onClose={() => setModal(null)} />
          {savedDecks.length === 0 ? (
            <div style={{ textAlign: "center", color: "#475569", padding: 40 }}><div style={{ fontSize: 40, marginBottom: 10 }}>🗃️</div>No saved decks yet</div>
          ) : savedDecks.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{d.cards.length} cards · {d.date}</div>
              </div>
              <button style={css.btn("rgba(255,255,255,.06)", "#94a3b8", "1px solid rgba(255,255,255,.1)")} onClick={() => { setDeck(d.cards); setDeckName(d.name); setModal(null) }}>Load</button>
              <button style={{ ...css.btn("rgba(239,68,68,.08)", "#fca5a5", "1px solid rgba(239,68,68,.15)"), padding: isMobile ? "10px 12px" : "7px 10px" }} onClick={() => setSavedDecks(p => p.filter((_, j) => j !== i))}>🗑️</button>
            </div>
          ))}
        </Overlay>
      )}
    </div>
  );
}
