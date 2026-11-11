# Cheek Pouch

![Cheek Pouch: a crowned hamster with stuffed cheeks catching sunflower seeds at night](art/cheek-pouch-cover.png)

An endless hamster arcade game for the Squeekchain hamster economy. Stuff sunflower seeds into your cheeks, dodge angry red-hot pebbles and the cat's paw, and carry your haul home to the burrow. The bigger the haul, the bigger the payout: n seeds bank for 1+2+…+n.

**Play:** https://cheek-pouch.live

**Builder:** [The-9thCypher](https://github.com/The-9thCypher) · wallet `0x6d230066601100630134a7d694a4d873e273c530`

## How it uses Squeekchain

The game reads Squeekchain's public API every 8 seconds, straight from the browser:

- **Real wheel, real pace (Free play).** While Squeektoshi is running, the sky turns to day, seeds fall faster and every bank pays ×2. While he rests, the game plays at night at ×1.
- **Golden seeds.** In Free play, every increase in logged wheel work drops golden seeds (+20 each) and each completed block drops a golden shower. In the Daily Burrow, yesterday's real wheel work sets how many golden seeds fall.
- **Daily Burrow.** The same run for everyone each day. The server replays each run's key presses with the same game code to verify it, so only verified runs reach the boards. Race the leader's ghost, and send challenge links.
- **Duels.** Send a friend a link: you both get the same secret seed and one try, replay-verified. The winner takes 150 XP, and duel wins unlock a medal, bandana, champion belt and ember fur. One-tap rematches, a badge when it's your turn, and a weekly Duel Cup (500 XP, the Cup laurel and a 🏆 on every board).
- **Boss cat.** Every second level a big cat swipes three times. Dodge all three for a seed jackpot.
- **Block Champion.** Each Squeekchain block goes to the best Daily Burrow score set while it was being mined.
- **Squeek perks.** A signed-in wallet's real holdings unlock wardrobe items: a crown (hold 1+ Squeek), staker shades (stake 1+), a merge scarf (own a level 2+ Squeek) and golden fur (hold 10+). Outfits never change the score.
- **Live strip.** Wheel RPM and speed, work logged, the settled round, and progress toward the next block.
- **Wallet sign-in and saved progress.** Players sign a free "Sign in with Ethereum" message (no gas, no transaction). Progress follows the wallet to any device: XP and hamster level, streaks, daily and weekly missions, outfits, blocks won and daily podiums. The boards mark Squeek holders with ♛.

No transactions are sent and no keys are handled; the only signature is the free sign-in message. Squeekchain endpoints used:

| Endpoint | Used for |
|---|---|
| `GET https://api.squeekchain.com/v1/status` | wheel state, RPM, speed, cumulative work, block height and progress, settled round |
| `GET https://api.squeekchain.com/v1/accounts/{address}` | Squeek counts, staked count and levels, for perks |
| `GET https://api.squeekchain.com/v1/measurement/stats?range=7d` | yesterday's wheel work, which sets the Daily Burrow's golden seeds (server) |

## Gameplay

- It never ends on a timer. You have 3 hearts, and a new level starts every 20 seconds: faster pebbles, pairs, wind gusts, pebble storms, owl swoops, double swipes, puddles, then everything speeds up.
- Power-ups drop from the sunflowers: a helmet blocks one hit, a magnet pulls seeds in, big cheeks hold 16.
- Free play is practice: it keeps your streak and counts toward run missions, but only Daily Burrow runs reach the boards and earn score XP.
- Controls: arrow keys or A/D to run, Space or Up to hop, Enter to start, P to pause, M to toggle sound. Phones get on-screen buttons.

## Files

- `cheek-pouch.html` is the game source.
- `index.html` is the hosted page, built from the source with `python3 build.py`.
- `art/` holds the cover and icon images; `art/cover.html` draws them.
- `api/` is the Cloudflare Worker and D1 database behind sign-in, saved progress and the leaderboard (`npm run deploy` from that folder).
- No build tools, no dependencies, no server.

## Squeekchain Genesis

squeekchain-project: 430e9294-1c8e-4e18-aacc-e1dab9dd0462
