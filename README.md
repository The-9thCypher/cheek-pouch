# Cheek Pouch

![Cheek Pouch: a crowned hamster with stuffed cheeks catching sunflower seeds at night](art/cheek-pouch-cover.png)

An endless hamster arcade game for the Squeekchain hamster economy. Stuff sunflower seeds into your cheeks, dodge angry red-hot pebbles and the cat's paw, and carry your haul home to the burrow. The bigger the haul, the bigger the payout: n seeds bank for 1+2+…+n.

**Play:** https://cheek-pouch.live

**Builder:** [The-9thCypher](https://github.com/The-9thCypher) · wallet `0x6d230066601100630134a7d694a4d873e273c530`

## How it uses Squeekchain

The game reads Squeekchain's public API every 8 seconds, straight from the browser:

- **Real wheel, real pace.** While Squeektoshi is running, the sky turns to day, seeds fall faster as his RPM rises, and every bank pays ×2. While he rests, the game plays at night at ×1.
- **Golden seeds.** Every increase in logged wheel work drops golden seeds (+20 each) into every open run. Each completed Squeekchain block drops a golden shower.
- **Bonus bet.** Before a run you can bet on whether the real hamster will be on his wheel when the run ends. It settles on the live feed at that moment; a stale reading cancels it.
- **Squeek perks.** Paste a wallet address to unlock cosmetic perks from real holdings: a crown (hold 1+ Squeek), sunglasses (stake 1+), a scarf (own a level 2+ Squeek) and golden fur (hold 10+). Perks never change the score.
- **Live strip.** Wheel RPM and speed, work logged, the settled round, and progress toward the next block.
- **His usual hours.** The last 7 days of wheel stats give Squeektoshi's usual running window, shown in each player's own time zone with a countdown to his next likely run.
- **Wallet sign-in and saved progress.** Players sign a free "Sign in with Ethereum" message (no gas, no transaction). Best score, best level, runs played and Squeek perks are saved to their wallet and follow them to any device, and the leaderboard marks Squeek holders with ♛. The server times every run itself and rejects scores that are impossible for the run's length.

No transactions are sent and no keys are handled; the only signature is the free sign-in message. Squeekchain endpoints used:

| Endpoint | Used for |
|---|---|
| `GET https://api.squeekchain.com/v1/status` | wheel state, RPM, speed, cumulative work, block height and progress, settled round |
| `GET https://api.squeekchain.com/v1/accounts/{address}` | Squeek counts, staked count and levels, for perks |
| `GET https://api.squeekchain.com/v1/measurement/stats?range=7d` | his usual running hours |

## Gameplay

- It never ends on a timer. You have 3 hearts, and a new level starts every 20 seconds: faster pebbles, pairs, a quicker cat, pebble storms, double swipes, then everything speeds up.
- Controls: arrow keys or A/D to run, Space or Up to hop, Enter to start, P to pause, M to toggle sound. Phones get on-screen buttons.

## Files

- `cheek-pouch.html` is the game source.
- `index.html` is the hosted page, built from the source with `python3 build.py`.
- `art/` holds the cover and icon images; `art/cover.html` draws them.
- `api/` is the Cloudflare Worker and D1 database behind sign-in, saved progress and the leaderboard (`npm run deploy` from that folder).
- No build tools, no dependencies, no server.

## Squeekchain Genesis

squeekchain-project: 430e9294-1c8e-4e18-aacc-e1dab9dd0462
