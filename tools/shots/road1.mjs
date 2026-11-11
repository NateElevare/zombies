export default async function (page, shot) {
  await page.waitForTimeout(1200);
  await shot('10-title');
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(2500);
  await shot('11-briefing');
  // begin the mission and look around the start
  await page.evaluate(() => { const s = window.deadzone.scene.state; s.ui = null; });
  await page.waitForTimeout(1500);
  await shot('12-start');
  // walk toward the shotgun: teleport near it
  await page.evaluate(() => {
    const s = window.deadzone.scene.state, r = s.road, pt = r.objectives[0].point;
    s.player.x = s.player.prevX = pt.x + 60; s.player.y = s.player.prevY = pt.y + 40;
  });
  await page.waitForTimeout(1500);
  await shot('13-engine-bay');
  // the yard: skip to objective 2 and 3
  await page.evaluate(() => { window.deadzone.sim.road.devSkip(window.deadzone.scene.state); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = window.deadzone.scene.state, r = s.road, pt = r.objectives[1].point;
    s.player.x = s.player.prevX = pt.x; s.player.y = s.player.prevY = pt.y + 120;
  });
  await page.waitForTimeout(2500);
  await shot('14-yard-clear');
  await page.evaluate(() => { window.deadzone.sim.road.devSkip(window.deadzone.scene.state); });
  await page.evaluate(() => {
    const s = window.deadzone.scene.state, r = s.road, pt = r.objectives[2].point;
    s.player.x = s.player.prevX = pt.x - 120; s.player.y = s.player.prevY = pt.y + 30;
  });
  await page.waitForTimeout(9000);
  await shot('15-holdout-gate');
  // map
  await page.evaluate(() => { const s = window.deadzone.scene.state; window.deadzone.sim.game.setUi(s, 'map'); });
  await page.waitForTimeout(1500);
  await shot('16-map');
  await page.evaluate(() => { const s = window.deadzone.scene.state; window.deadzone.sim.game.setUi(s, null); });
  // complete the mission
  await page.evaluate(() => { const road = window.deadzone.sim.road, s = window.deadzone.scene.state; road.devSkip(s); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const road = window.deadzone.sim.road, s = window.deadzone.scene.state; const pt = s.road.objectives[3].point; s.player.x = s.player.prevX = pt.x; s.player.y = s.player.prevY = pt.y; for (const z of s.zombies) z.dead = true; });
  await page.waitForTimeout(1500);
  await shot('17-complete');
}
