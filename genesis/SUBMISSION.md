# Cheek Pouch — Genesis Code Lane submission

## Project details

- **Builder:** The-9thCypher
- **Builder wallet:** `0x6d230066601100630134a7d694a4d873e273c530`
- **Live site:** https://cheek-pouch.live
- **Repository:** https://github.com/The-9thCypher/cheek-pouch

## One-line pitch

An endless hamster arcade game where the real Squeektoshi sets the pace: when he runs his wheel it turns day and every bank pays double, and every unit of work he logs drops golden seeds into your run.

## Description (paste into the project form)

Cheek Pouch is a one-screen arcade game for the hamster economy. You play a hamster stuffing sunflower seeds into its cheeks and carrying them home to the burrow. A bigger haul banks for much more (n seeds pay 1+2+…+n), but full cheeks slow you down, and angry red-hot pebbles, a cat's paw and a swooping owl knock half your haul loose. The game is endless and gets harder every 20 seconds, with wind, storms and puddles along the way; power-ups (helmet, magnet, big cheeks) drop from the sunflowers.

How it uses Squeekchain:
- Free play follows the live wheel (`/v1/status`): while Squeektoshi runs, the sky turns to day, seeds fall faster and every bank pays ×2; every increase in `cumulativeWorkUnits` drops golden seeds, and each completed block drops a golden shower. Squeektoshi sits in the in-game wheel, asleep or running.
- The Daily Burrow gives everyone the same run each day; yesterday's real wheel work (`/v1/measurement/stats`) sets how many golden seeds fall. The server replays every run's key presses with the same game code, so only verified runs reach the boards.
- Block Champion: each Squeekchain block goes to the best Daily Burrow score set while it was being mined.
- Squeek holders unlock wardrobe items from their real holdings (`/v1/accounts`): a crown, staker shades, a merge scarf and golden fur. Outfits never change the score.
- Wallet sign-in is a free signed message, no transaction. Progress follows the wallet: XP and hamster level, streaks, daily and weekly missions, the leader's ghost, challenge links and share cards.

No transactions are sent and no keys are handled; the only signature is the free sign-in message.

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
