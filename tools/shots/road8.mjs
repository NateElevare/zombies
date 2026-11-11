export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const road = window.deadzone.sim.road, s = window.deadzone.scene.state, bosses = window.deadzone.sim.bosses;
    road.startMission(s, 9); s.ui = null; road.begin(s); s.dev = { timeScale: 1, freeze: false, god: true };
    while (s.road.step < 6) road.devSkip(s);                      // the Warden objective
    const pt = s.road.objectives[6].point; s.player.x = s.player.prevX = pt.x; s.player.y = s.player.prevY = pt.y + 200; s.player.flashlight = true;
    s.zombies.length = 0;
  });
  await page.waitForFunction(() => { const sc = window.deadzone.scene, s = sc.state, c = sc.cameras.main; const cx = c.worldView.x + c.worldView.width / 2, cy = c.worldView.y + c.worldView.height / 2; return Math.hypot(cx - s.player.x, cy - s.player.y) < 60; }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await shot('90-warden');
  await page.evaluate(() => { const s = window.deadzone.scene.state; const w = s.zombies.find(z => z.boss === 'warden'); if (w) { w.hp = w.maxHp * 0.45; w.x = w.prevX = s.player.x + 200; w.y = w.prevY = s.player.y - 120; } });
  await page.waitForTimeout(1200);
  await shot('91-warden-stage3');
  // the Butcher's cleavers
  await page.evaluate(() => {
    const s = window.deadzone.scene.state, bosses = window.deadzone.sim.bosses;
    for (const z of s.zombies) z.dead = true; s.zombies.length = 0; bosses.clearFx(s);
    const b = bosses.spawnBossOf(s, 'butcher', 0, s.player.x + 380, s.player.y, 1, { maxR: 26, kit: 1 }); b.cd.charge = 99; b.cd.throw = 0;
  });
  await page.waitForTimeout(1300);
  await shot('92-cleavers');
}
