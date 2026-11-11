export default async function (page, shot) {
  await page.waitForTimeout(800);
  await shot('40-title');
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const road = window.deadzone.sim.road, s = window.deadzone.scene.state;
    s.ui = null; road.begin(s); s.dev = { timeScale: 1, freeze: false, god: true };
    while (s.road.step < 3) road.devSkip(s);
    const g = s.road.world.gates[0]; s.player.x = s.player.prevX = g.x - 260; s.player.y = s.player.prevY = g.y + g.h / 2 + 40;
  });
  await page.waitForFunction(() => { const sc = window.deadzone.scene, s = sc.state, c = sc.cameras.main; const cx = c.worldView.x + c.worldView.width / 2, cy = c.worldView.y + c.worldView.height / 2; return Math.hypot(cx - s.player.x, cy - s.player.y) < 60; }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot('41-gate-closed');
  await page.evaluate(() => { const road = window.deadzone.sim.road, s = window.deadzone.scene.state; for (const z of s.zombies) z.dead = true; const c = road.campOf(s, 0); s.player.x = s.player.prevX = c.x; s.player.y = s.player.prevY = c.y + 20; });
  await page.waitForTimeout(2500);
  await shot('42-checkpoint-reached');
  await page.evaluate(() => { const s = window.deadzone.scene.state; s.ui = null; });
  await page.waitForTimeout(2500);
  await shot('43-gate-open-next-mission');
}
