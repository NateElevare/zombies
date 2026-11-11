export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const road = window.deadzone.sim.road, s = window.deadzone.scene.state;
    road.startMission(s, 9); s.ui = null; road.begin(s); s.dev = { timeScale: 1, freeze: false, god: true };
    while (s.road.step < 1) road.devSkip(s);
    const pt = s.road.objectives[1].point; s.player.x = s.player.prevX = pt.x; s.player.y = s.player.prevY = pt.y; s.player.flashlight = true;
  });
  await page.waitForFunction(() => { const sc = window.deadzone.scene, s = sc.state, c = sc.cameras.main; const cx = c.worldView.x + c.worldView.width / 2, cy = c.worldView.y + c.worldView.height / 2; return Math.hypot(cx - s.player.x, cy - s.player.y) < 60; }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(25000);
  await shot('95-windows');
  console.log(await page.evaluate(() => { const s = window.deadzone.scene.state; const b = s.buildings.find(b => b.name === 'North Ridge Relay'); const wins = s.grid.query(b.x - 4, b.y - 4, b.w + 8, b.h + 8).filter(o => o.kind === 'window'); return JSON.stringify({ windows: wins.length, smashed: wins.filter(w => w.smashed).length, inside: s.zombies.filter(z => !z.dead && z.x > b.x && z.x < b.x + b.w && z.y > b.y && z.y < b.y + b.h).length }); }));
}
