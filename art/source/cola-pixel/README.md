# Cola & Mints art

Code-native pixel art is authored in `art/cola/pixel.ts`, using the same integer
pixel/nearest-neighbor approach as the game's particle assets. Two imagegen
attempts were rejected by the image service; no generated image is used here.

Includes two 96px inventory/HUD icons, aligned idle and spraying bottle frames,
four animated foam clumps, and three impact splash frames. Bottle art faces east;
the grip origin is (0.3, 0.5). The runtime atlas is `public/assets/cola.png` with
matching `cola.json`. Icons are `public/assets/icons/cola_mints.png` and `mints.png`.

Rebuild with `npm run art:cola`, then `npm run build`. Full art and icon rebuilds
also preserve these assets. Preview: `art/preview/cola-mints.png`.

The renderer uses the bottle's spraying frame only during fire, reuses the player
reload poses, animates foam projectiles and shows cola splashes on hit. Weapon
stats, damage, sticky slow, ammunition and reload behavior remain in the simulation.
