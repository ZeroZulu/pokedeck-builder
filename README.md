<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,9,5&height=220&section=header&text=⚡%20PokéDeck%20Builder&fontSize=50&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=Build.%20Analyze.%20Dominate.&descSize=18&descAlignY=55&descColor=fbbf24" width="100%" />
</p>

<p align="center">
  <a href="#-get-running"><img src="https://img.shields.io/badge/🚀_GET_STARTED-Click_Here-ef4444?style=for-the-badge" /></a>
  <a href="#-deploy-free"><img src="https://img.shields.io/badge/🌐_DEPLOY_FREE-Vercel-000000?style=for-the-badge&logo=vercel" /></a>
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&duration=3000&pause=1000&color=22D3EE&center=true&vCenter=true&multiline=true&repeat=true&width=600&height=80&lines=20%2C000%2B+cards+from+every+set+ever+printed;Real-time+deck+analytics+%26+validation;One-click+meta+decks+%7C+Zero+cost+hosting" />
</p>

<br/>

<table align="center">
<tr>
<td align="center" width="170">
<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png" width="80" /><br/>
<sub><b>🔍 20K+ Cards</b></sub><br/>
<sub>Every set. Live API.</sub>
</td>
<td align="center" width="170">
<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/887.png" width="80" /><br/>
<sub><b>🃏 Deck Builder</b></sub><br/>
<sub>TCG rules enforced.</sub>
</td>
<td align="center" width="170">
<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/282.png" width="80" /><br/>
<sub><b>📊 Live Analytics</b></sub><br/>
<sub>Types. HP. Validation.</sub>
</td>
<td align="center" width="170">
<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/149.png" width="80" /><br/>
<sub><b>🏆 Meta Decks</b></sub><br/>
<sub>1-click competitive.</sub>
</td>
</tr>
</table>

<br/>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,9,5&height=2&section=header" width="60%" />
</p>

## ✨ What Makes This Different

<table>
<tr>
<td>

```diff
+ No ads, no paywalls, no accounts
+ Auto-updates with new card releases
+ Works on phone, tablet & desktop
+ Import/export PTCGO format
+ One-click meta deck loading
+ Full offline deck storage
- Zero backend needed
- Zero monthly cost
```

</td>
<td>

| vs Others | PokéDeck | pokemoncard.io | limitlesstcg |
|:---:|:---:|:---:|:---:|
| Free & open source | ✅ | ❌ | ❌ |
| No account needed | ✅ | ❌ | ❌ |
| Meta deck loader | ✅ | ❌ | ❌ |
| Live HP/type analytics | ✅ | ❌ | ⚠️ |
| PTCGO import/export | ✅ | ✅ | ✅ |
| Mobile responsive | ✅ | ⚠️ | ⚠️ |

</td>
</tr>
</table>

<br/>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,9,5&height=2&section=header" width="60%" />
</p>

## 🚀 Get Running

```bash
git clone https://github.com/YOUR_USERNAME/pokedeck-builder.git
cd pokedeck-builder
npm install
npm run dev           # → http://localhost:3000
```

> [!TIP]
> Grab a **free** API key from [dev.pokemontcg.io](https://dev.pokemontcg.io) → create `.env` → add `VITE_POKEMONTCG_API_KEY=your-key` → restart. Goes from 1K → **20K requests/day**.

<br/>

## 🌐 Deploy (Free)

```bash
npm run build
npx vercel --prod
```

> Zero cost. Zero backend. Static files on a global CDN. Done.

<details>
<summary>📋 Other free hosts</summary>
<br/>

| Host | Command | Bandwidth |
|:---|:---|:---|
| **Vercel** ⭐ | `npx vercel --prod` | 100GB/mo |
| **Netlify** | `netlify deploy --prod --dir=dist` | 100GB/mo |
| **Cloudflare** | `wrangler pages deploy dist` | Unlimited |
| **GitHub Pages** | `npm run deploy` | Unlimited |

</details>

<br/>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,9,5&height=2&section=header" width="60%" />
</p>

## 🛠 Under the Hood

<p align="center">
  <img src="https://skillicons.dev/icons?i=react,vite,js,html,css,vercel&theme=dark" />
</p>

<p align="center">
  <code>AbortController</code> · <code>In-memory cache</code> · <code>localStorage persistence</code> · <code>Debounced search</code> · <code>Exponential backoff</code>
</p>

<p align="center">
  <sub>One file. ~950 lines. No UI libraries. Every style inline. Ship it anywhere.</sub>
</p>

<br/>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,9,5&height=120&section=footer" width="100%" />
</p>

<p align="center">
  <sub>Card data from <a href="https://pokemontcg.io">pokemontcg.io</a> · Pokémon © Nintendo / The Pokémon Company · Made with ❤️ and too much caffeine</sub>
</p>
