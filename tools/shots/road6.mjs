export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  const ok = await page.evaluate(() => {
    const road = window.deadzone.sim.road, s = window.deadzone.scene.state, phys = window.deadzone.sim.core.phys;
    s.ui = null; road.begin(s); s.dev = { timeScale: 1, freeze: false, god: true };
    // stand in front of the nearest free cabinet inside a building
    const p = s.player; let best = null, bd = 1e9;
    for (const c of s.containers) { if (!c.buildingId) continue; const spot = { x: c.x + c.w / 2, y: c.y + c.h + 30 }; if (!phys.isFree(s, spot.x, spot.y, 14)) continue; const d = Math.hypot(spot.x - p.x, spot.y - p.y); if (d < bd) { bd = d; best = spot; } }
    p.x = p.prevX = best.x; p.y = p.prevY = best.y; for (const z of s.zombies) z.dead = true;
    return !!best;
  });
  console.log('placed', ok);
  await page.waitForTimeout(1500);
  await shot('70-search-prompt');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(600);
  await shot('71-searching');
  await page.waitForFunction(() => window.deadzone.scene.state.ui === 'loot', null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(800);
  await shot('72-loot');
  console.log(await page.evaluate(() => { const s = window.deadzone.scene.state; return JSON.stringify({ ui: s.ui, looted: s.stats.containersLooted }); }));
}
