export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const road = window.deadzone.sim.road, s = window.deadzone.scene.state;
    s.ui = null; road.begin(s); s.dev = { timeScale: 1, freeze: false, god: true };
    while (s.road.step < 3) road.devSkip(s);
    for (const z of s.zombies) z.dead = true;
    const c = road.campOf(s, 0); s.player.x = s.player.prevX = c.x + 70; s.player.y = s.player.prevY = c.y + 90;
  });
  await page.waitForFunction(() => { const sc = window.deadzone.scene, s = sc.state, c = sc.cameras.main; const cx = c.worldView.x + c.worldView.width / 2, cy = c.worldView.y + c.worldView.height / 2; return Math.hypot(cx - s.player.x, cy - s.player.y) < 60; }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot('80-camp-labels');
  // continue into mission 2 (briefing) and dismiss it: the cache must still be on the ground
  await page.evaluate(() => { const s = window.deadzone.scene.state; window.deadzone.sim.road.next(s); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const s = window.deadzone.scene.state; s.ui = null; });
  await page.waitForTimeout(2500);
  await shot('81-camp-after-continue');
}
