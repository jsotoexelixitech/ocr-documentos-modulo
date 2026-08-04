/**
 * Catálogo Exélixi (product-builder) — solo lectura para el front OCR.
 */
const express = require('express');
const builder = require('../services/productBuilderClient');

const router = express.Router();

/**
 * @openapi
 * /api/catalog/products:
 *   get:
 *     tags: [Catálogo]
 *     summary: Lista productos emitibles del product-builder
 *     responses:
 *       200:
 *         description: Productos con planes y coberturas listos
 */
router.get('/products', async (_req, res, next) => {
  try {
    const products = await builder.listEmitibleProducts();
    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/catalog/products/{id}:
 *   get:
 *     tags: [Catálogo]
 *     summary: Detalle de un producto emitible
 */
router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await builder.getProduct(req.params.id);
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
