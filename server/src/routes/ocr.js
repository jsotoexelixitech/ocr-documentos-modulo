/**
 * Rutas del modulo OCR.
 *
 * Solo expone los endpoints relacionados con la lectura de documentos.
 * No tiene dependencias con otros modulos: el response es un contrato
 * estable que el frontend transforma en un mensaje de bus si se desea.
 */
const express = require('express');
const fs      = require('fs/promises');
const multer  = require('multer');
const path    = require('path');
const sharp   = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { validateDocument, runOcr, VALID_DOC_TYPES } = require('../services/documentService');

const router = express.Router();

// ── Multer storage ────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const fileFilter = (_req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/heic', 'image/heif',
    'application/pdf',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Usa JPG, PNG, HEIC o PDF.`));
};

const upload = multer({
  storage, fileFilter,
  limits: { fileSize: parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) * 1024 * 1024 || 25 * 1024 * 1024 },
});

// ── Normalizacion de imagen para OCR optimo ─────────────────────────────
async function normalizeImage(filePath, mimetype) {
  const HEIC = ['image/heic', 'image/heif'];
  const IMG  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', ...HEIC];
  if (!IMG.includes(mimetype)) return { filePath, mimetype };

  const out = filePath.replace(/(\.[^.]+)?$/, '_norm.jpg');
  await sharp(filePath)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .normalise()
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(out);

  if (filePath !== out) await fs.unlink(filePath).catch(() => {});
  return { filePath: out, mimetype: 'image/jpeg' };
}

/**
 * @openapi
 * /api/documents/upload:
 *   post:
 *     tags: [Documentos]
 *     summary: Sube y analiza un documento con OCR
 *     description: |
 *       Recibe un archivo de imagen o PDF, lo normaliza (escala, contraste, orientación)
 *       y extrae los campos mediante Google Gemini 2.5 Pro.
 *
 *       **Tipos de documento soportados:**
 *       - `cedula` — Cédula de identidad venezolana (V / E)
 *       - `licencia` — Licencia de conducir
 *       - `certificado` — Certificado de circulación del vehículo
 *       - `rif` — RIF (persona natural o jurídica)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, docType]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Imagen (JPG, PNG, WEBP, HEIC) o PDF. Máx 25 MB.
 *               docType:
 *                 type: string
 *                 enum: [cedula, licencia, certificado, rif]
 *                 description: Tipo de documento que se está subiendo
 *     responses:
 *       200:
 *         description: Documento procesado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:     { type: boolean, example: true }
 *                 message:     { type: string, example: 'Documento procesado exitosamente.' }
 *                 docType:     { type: string, example: 'cedula' }
 *                 file:
 *                   $ref: '#/components/schemas/DocumentFile'
 *                 ocr:
 *                   $ref: '#/components/schemas/OcrResult'
 *                 ocrProvider: { type: string, example: 'gemini' }
 *                 ocrFailed:   { type: boolean, description: 'true si el OCR no pudo leer el documento' }
 *       400:
 *         description: Parámetros faltantes o inválidos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       413:
 *         description: Archivo demasiado grande (supera 25 MB)
 *       422:
 *         description: El documento no coincide con el tipo declarado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:       { type: boolean, example: false }
 *                 code:          { type: string, example: 'DOC_TYPE_MISMATCH' }
 *                 message:       { type: string }
 *                 expected:      { type: string, example: 'cedula' }
 *                 detected:      { type: string, example: 'licencia' }
 *                 expectedLabel: { type: string, example: 'Cédula de identidad' }
 *                 detectedLabel: { type: string, example: 'Licencia de conducir' }
 *       500:
 *         description: Error interno del servidor
 */
router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibio ningun archivo.' });

    const { docType } = req.body;
    if (!docType) return res.status(400).json({ success: false, message: 'El campo docType es requerido.' });
    if (!VALID_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ success: false, message: `Tipo invalido: ${docType}` });
    }

    const normalized = await normalizeImage(req.file.path, req.file.mimetype);
    const file = { ...req.file, path: normalized.filePath, mimetype: normalized.mimetype };

    const validation = validateDocument(file, docType);
    if (!validation.valid) return res.status(422).json({ success: false, message: validation.message });

    const ocrResult = await runOcr(file, docType);

    if (ocrResult.mismatch) {
      try { await fs.unlink(req.file.path); } catch {}
      return res.status(422).json({
        success: false,
        code: 'DOC_TYPE_MISMATCH',
        message: ocrResult.mismatch.message,
        expected: ocrResult.mismatch.expected,
        detected: ocrResult.mismatch.detected,
        expectedLabel: ocrResult.mismatch.expectedLabel,
        detectedLabel: ocrResult.mismatch.detectedLabel,
        ocrProvider: ocrResult.provider,
        ...(ocrResult.meta ? { ocrMeta: ocrResult.meta } : {}),
      });
    }

    const fileName = path.basename(normalized.filePath);
    return res.status(200).json({
      success: true,
      message: ocrResult.ocrFailed
        ? 'Archivo recibido. No pudimos leer los datos automaticamente.'
        : 'Documento procesado exitosamente.',
      docType,
      file: {
        id: uuidv4(),
        name: req.file.originalname,
        size: req.file.size,
        mimeType: normalized.mimetype,
        url: `/files/${fileName}`,
      },
      ocr: ocrResult.fields,
      ocrProvider: ocrResult.provider,
      ...(ocrResult.ocrFailed ? { ocrFailed: true } : {}),
      ...(ocrResult.meta ? { ocrMeta: ocrResult.meta } : {}),
      ...(ocrResult.error ? { ocrError: ocrResult.error } : {}),
    });
  } catch (err) {
    console.error('[modulo-ocr/upload] error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Error interno.' });
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Archivo supera el limite permitido.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  return res.status(400).json({ success: false, message: err.message });
});

module.exports = router;
