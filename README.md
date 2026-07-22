 ▲ Mountaineer — Predictive Markets
 
A real-time predictive market game where players forecast how high a market multiplier will climb before it peaks and resets. Choose your mountain, stake your position, and exit before the market peaks to collect your return.
 
---
 
## What It Is
 
Mountaineer takes the core tension of a multiplier-based market game and repositions it as a predictive market product. Players are not gambling — they are forecasting. The language, mechanics, and experience are modelled on financial instruments, not casino games.
 
Six mountain markets run simultaneously, each with a distinct risk profile ranging from low-volatility (Mont Blanc) to extreme (K2). Players select a market based on their risk appetite, stake tokens, and decide when to lock in their position as the multiplier climbs in real time.
 
---
 
## How It Works
 
Each round has three phases:
 
1. **Forecast Window (7s)** — Players stake tokens and optionally set an auto-exit multiplier before the round begins
2. **The Climb** — The market index rises exponentially. Players watch in real time and choose when to lock in
3. **Settlement** — The market peaks. Players who exited before the peak collect their return. Players who did not exit lose their stake for that round
Return is calculated as:
```
Return = Stake × Exit Multiplier
```
 
---
 
## The Six Markets
 
| Mountain | Risk | Character |
|---|---|---|
| K2 | Extreme | Highest variance. Crashes often, but occasional enormous outliers |
| Everest | High | Substantial upside, rewards disciplined forecasting |
| Aconcagua | Medium | Balanced risk and return, good for strategy development |
| Denali | Medium | Similar to Aconcagua, slightly longer average rounds |
| Kilimanjaro | Low | Consistent, low-drama rounds |
| Mont Blanc | Low | Most stable market, small reliable returns |
 
---
 
## Project Status
 
Currently a **front-end prototype** — no backend or database required. Both pages run entirely in the browser.
 
- `mountaineer-home.html` — Home/lobby page with all six mountain markets, live player data, leaderboards, and activity feed
- `mountaineer.html` — Individual market game page with live canvas chart and full game mechanics
---
 
## Roadmap
 
- [ ] User accounts and persistent balance
- [ ] Real round history per mountain
- [ ] Home → game page navigation with mountain context
- [ ] Mobile responsive layout
- [ ] Personal stats and analytics dashboard
- [ ] Tournament system
- [ ] Pari-mutuel pot structure (players as counterparties, platform takes rake)
---
 
## Built With
 
- Vanilla HTML, CSS, JavaScript
- Canvas API for real-time chart rendering
- Google Fonts — Syne + JetBrains Mono
---
 
*Mountaineer is a prototype. Not a financial product. Not affiliated with any gambling operator.*
