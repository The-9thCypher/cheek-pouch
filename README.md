# Cheek Pouch

![Cheek Pouch: a crowned hamster with stuffed cheeks catching sunflower seeds at night](art/cheek-pouch-cover.png)

An endless hamster arcade game. Stuff sunflower seeds into your cheeks, dodge angry red-hot pebbles, the cat's paw and the owl, and carry your haul home to the burrow. The bigger the haul, the bigger the payout: n seeds bank for 1+2+…+n.

**Play:** https://cheek-pouch.live

**Builder:** [The-9thCypher](https://github.com/The-9thCypher) · wallet `0x6d230066601100630134a7d694a4d873e273c530`

## Modes

- **Daily Burrow.** The same run for everyone each day, with 3 to 8 golden seeds set by the date. The server replays each run's key presses with the same game code to verify it, so only verified runs reach the boards. Race the leader's ghost, and send challenge links.
- **Duels.** Send a friend a link: you both get the same secret seed and one try, replay-verified. The winner takes 150 XP, and duel wins unlock a medal, bandana, champion belt and ember fur. An Open challenges lobby lists public duels (challenger scores hidden until you accept). One-tap rematches, a badge when it's your turn, and a weekly Duel Cup (500 XP, the Cup laurel and a 🏆 on every board).
- **Free play.** Practice at your own pace. About every minute a golden rush wakes the wheel hamster: golden seeds fall and banks pay ×2 for 12 seconds.

## Gameplay

- It never ends on a timer. You have 3 hearts, and a new level starts every 20 seconds: faster pebbles, pairs, wind gusts, pebble storms, owl swoops, double swipes, puddles, then everything speeds up.
- **Boss cat.** Every second level a big cat swipes three times. Dodge all three for a seed jackpot.
- **Growing cheeks.** You hold 12 seeds at first and 2 more every 3 levels.
- Power-ups drop from the sunflowers: a helmet blocks one hit, a magnet pulls seeds in, big cheeks hold 4 more.
- Controls: arrow keys or A/D to run, Space or Up to hop, Enter to start, P to pause, M for sound, N for music. Phones get on-screen buttons.

## Progress

Players sign a free "Sign in with Ethereum" message (no gas, no transaction, no keys handled). Progress follows the wallet to any device: XP and hamster level, streaks, daily and weekly missions, outfits, daily podiums and duel record. Outfits unlock with hamster level, duel wins and the Duel Cup, and never change the score.

## Files

- `cheek-pouch.html` is the game source; `game/sim.js` is the deterministic game core shared with the server.
- `index.html` is the hosted page, built from the source with `python3 build.py`.
- `art/` holds the cover and icon images; `art/cover.html` draws them.
- `api/` is the Cloudflare Worker and D1 database behind sign-in, saved progress, verification, duels and the boards (`npm run deploy` from that folder).
