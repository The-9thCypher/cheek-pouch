# Cheek Pouch — Genesis Code Lane submission

## Project details

- **Builder:** The-9thCypher
- **Builder wallet:** `0x6d230066601100630134a7d694a4d873e273c530`
- **Live site:** https://cheek-pouch.live
- **Repository:** https://github.com/The-9thCypher/cheek-pouch

## One-line pitch

An endless hamster arcade game where the real Squeektoshi sets the pace: when he runs his wheel it turns day and every bank pays double, and every unit of work he logs drops golden seeds into your run.

## Description (paste into the project form)

Cheek Pouch is a one-screen arcade game for the hamster economy. You play a hamster stuffing sunflower seeds into its cheeks and carrying them home to the burrow. A bigger haul banks for much more (n seeds pay 1+2+…+n), but full cheeks slow you down, and angry red-hot pebbles and a cat's paw knock half your haul loose. The game is endless and gets harder every 20 seconds, adding faster pebbles, pairs, pebble storms and double swipes.

The game is tied to the real wheel on Squeekchain's public API, checked every 8 seconds:
- While Squeektoshi is running, the sky turns to day, seeds fall faster as his RPM rises, and every bank pays ×2. While he rests, the game plays at night at ×1.
- Every increase in `cumulativeWorkUnits` drops golden seeds (+20 each) into every open run. Each completed Squeekchain block drops a golden shower.
- Players sign in with their wallet (a free signed message, no transaction) to save progress across devices and join the leaderboard; the server times each run and rejects impossible scores.
- Squeek holders can look up their wallet, read-only, to unlock cosmetic perks from real holdings: a crown (hold 1+), sunglasses (stake 1+), a scarf (own a level 2+ Squeek from merging) and golden fur (hold 10+). Perks never change the score, so the leaderboard stays fair.
- A live strip shows wheel RPM, speed, work logged, the settled round and progress toward the next block.

Nothing is signed and no keys are handled. The wallet lookup only reads `GET /v1/accounts/{address}`.

## Squeekchain endpoints used

| Endpoint | Used for |
|---|---|
| `GET https://api.squeekchain.com/v1/status` | `measurement.coreStatus`, `rpmMilli`, `speedMmPerSecond`, `cumulativeWorkUnits`, `counterEpoch`, `freshness`; `builder.projected.blockHeight` / `blockProgress`; `builder.anchor.settledThroughRound` |
| `GET https://api.squeekchain.com/v1/accounts/{address}` (paged with `?cursor=`) | `tokenCounts.wallet`, `tokenCounts.staking`, `tokens[].level` for perks |

## Controls

Arrow keys or A/D to run, Space or Up to hop, Enter to start, P to pause, M to toggle sound. On phones, on-screen buttons appear under the playfield.

## Files

- `../index.html` is the whole game in one file, built from `../cheek-pouch.html` with `python3 build.py`. Host it as a static page.

## Before submitting

1. Build or host the project through an IMD job **paid from the wallet verified on your Squeekchain profile**. That is how Genesis proves the project is yours.
2. The shared leaderboard in `index.html` uses claude.ai's artifact storage, so it only works on the claude.ai copy. On any other host the board shows a note instead, and the rest of the game works fully. To have a leaderboard on the IMD-hosted version, ask IMD to add a small score backend; the score format is `{score, level, secs, nick, holder, at}`, one entry per player.
3. Test on desktop and phone, then submit the hosted link.
