import { Router } from 'express';
const router = Router();
const cache = new Map<string, { expires: number; value: Record<string, string | number> }>();
router.get('/food/:barcode', async (req, res) => {
  const barcode = String(req.params.barcode);
  if (!/^\d{8,14}$/.test(barcode)) { res.status(400).json({ error: 'Use an 8–14 digit product barcode.' }); return; }
  const saved = cache.get(barcode);
  if (saved && saved.expires > Date.now()) { res.json(saved.value); return; }
  try {
    const upstream = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,nutriments,code`, {
      headers: { 'User-Agent': 'GYMBuddy/1.0 (nutrition barcode lookup)' }, signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`Food database returned ${upstream.status}`);
    const data = await upstream.json() as { status: number; product?: { product_name?: string; nutriments?: Record<string, number> } };
    if (!data.product || data.status === 0) { res.status(404).json({ error: 'Product not found. You can enter its label manually.' }); return; }
    const nutrients = data.product.nutriments ?? {};
    const calories = nutrients['energy-kcal_100g'] ?? (typeof nutrients.energy_100g === 'number' ? nutrients.energy_100g / 4.184 : undefined);
    const protein = nutrients.proteins_100g, carbs = nutrients.carbohydrates_100g, fat = nutrients.fat_100g;
    if (![calories, protein, carbs, fat].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) || !calories || !data.product.product_name) {
      res.status(422).json({ error: 'The product nutrition is incomplete. Check the package and enter it manually.' }); return;
    }
    const value = { barcode, name: data.product.product_name.slice(0,120), calories: Number(calories), protein, carbs, fat, source: 'Open Food Facts • per 100 g' };
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(barcode, { expires: Date.now() + 600000, value });
    res.json(value);
  } catch (e) {
    req.log.warn({ error: e instanceof Error ? e.message : 'Food lookup failed' }, 'Food barcode lookup unavailable');
    res.status(503).json({ error: 'Food lookup is unavailable. Your existing records are unchanged; enter the label manually or retry.' });
  }
});
export default router;