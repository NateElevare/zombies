export default async function (page, shot) {
  await page.evaluate(() => window.deadzone.scene.api.newRoad('survivor'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const road = window.deadzone.sim.road, s = window.deadzone.scene.state, inv = window.deadzone.sim.inventory;
    s.ui = null; road.begin(s);
    // simulate a bit of scavenging
    inv.add(s.player.inv, 'medkit', 2); inv.add(s.player.inv, 'bandage', 3); inv.add(s.player.inv, 'shotgun', 1, { mag: 6 }); inv.add(s.player.inv, 'pistol', 1, { mag: 12 }); inv.add(s.player.inv, 'leather_jacket', 1); inv.add(s.player.inv, 'ammo_12g', 24);
    s.player.inv.equip.primary = { id: 'shotgun', qty: 1, mag: 6 }; s.player.inv.equip.body = { id: 'hoodie', qty: 1 };
    s.player.sp = 3; s.player.level = 4;
    window.deadzone.sim.game.setUi(s, 'inventory');
  });
  await page.waitForTimeout(1500);
  await shot('50-inventory');
  await page.evaluate(() => { const s = window.deadzone.scene.state; window.deadzone.sim.game.setUi(s, 'tech'); });
  await page.waitForTimeout(1500);
  await shot('51-tech');
}
