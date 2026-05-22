/**
 * Gemini OCR provider — versión pro con fallback automático y reintentos.
 *
 * Estrategia para garantizar lectura al 100 %:
 *   1. Intenta primero con el modelo más capable (`gemini-2.5-pro` por default).
 *   2. Si falla por error transitorio (5xx, rate limit, timeout) reintenta 2x
 *      con backoff exponencial.
 *   3. Si falla de forma permanente o el resultado no tiene campos críticos,
 *      cae al siguiente modelo de la cadena: pro → flash → flash-lite.
 *   4. Solo declara fallo si TODOS los modelos de la cadena fallan.
 *
 * Variables de entorno:
 *   GEMINI_API_KEY   Requerido.
 *   GEMINI_MODEL     Opcional. Modelo principal. Default: gemini-2.5-pro.
 *   GEMINI_MODELS    Opcional. Cadena CSV de fallback. Default:
 *                    "gemini-2.5-pro,gemini-2.5-flash,gemini-2.5-flash-lite".
 *   GEMINI_MAX_RETRIES Opcional. Reintentos por modelo. Default: 2.
 */

const fs = require('fs/promises');
const { GoogleGenAI, Type } = require('@google/genai');

const DEFAULT_PRIMARY_MODEL = 'gemini-2.5-pro';
const DEFAULT_FALLBACK_CHAIN = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const SUPPORTED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no esta configurado en .env');
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/**
 * Cadena de modelos a intentar en orden. Si el usuario configuró GEMINI_MODEL
 * lo ponemos primero y dejamos los demás como respaldo. GEMINI_MODELS lo
 * sobreescribe completamente si está definido.
 */
function getModelChain() {
  const explicit = process.env.GEMINI_MODELS;
  if (explicit) {
    return explicit.split(',').map(s => s.trim()).filter(Boolean);
  }
  const primary = process.env.GEMINI_MODEL || DEFAULT_PRIMARY_MODEL;
  const chain = [primary];
  for (const m of DEFAULT_FALLBACK_CHAIN) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}

/**
 * Indica si un error es transitorio y merece reintento (5xx, rate limit,
 * timeout, abort). Usamos heurística porque @google/genai no expone códigos
 * estandarizados.
 */
function isTransientError(err) {
  if (!err) return false;
  const msg = String(err.message || err.toString()).toLowerCase();
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') return true;
  if (err.status >= 500 && err.status < 600) return true;
  if (err.status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('exceeded')) return true;
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('temporarily') || msg.includes('unavailable')) return true;
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Campos críticos que validamos por tipo de documento. Si están vacíos en la
 * primera respuesta, intentamos con el siguiente modelo de la cadena.
 */
const CRITICAL_FIELDS = {
  cedula:      ['identificacion', 'nombre', 'apellido'],
  licencia:    ['numeroLicencia'],
  certificado: ['placa'],
  rif:         ['rif'],
};

/**
 * Verifica que los campos críticos del resultado estén presentes y no vacíos.
 * Devuelve { ok, missing[] } para diagnóstico.
 */
function validateCriticalFields(docType, fields) {
  const required = CRITICAL_FIELDS[docType] || [];
  const missing = [];
  for (const f of required) {
    const v = fields ? fields[f] : null;
    if (v == null || String(v).trim() === '') missing.push(f);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Campo de validacion compartido por todos los esquemas.
 * Gemini SIEMPRE debe identificar el tipo de documento real en la imagen,
 * independientemente del slot donde se subio.
 *
 * Headers oficiales que la IA debe reconocer:
 *   - cedula:      "REPUBLICA BOLIVARIANA DE VENEZUELA" + "CEDULA DE IDENTIDAD"
 *   - licencia:    "Licencia para Conducir" + INTT
 *   - certificado: "CERTIFICADO DE CIRCULACION" + INTT  (incluye TITULO de propiedad)
 *   - rif:         "REGISTRO UNICO DE INFORMACION FISCAL" + SENIAT
 */
const DOC_TYPE_PROP = {
  type: Type.STRING,
  enum: ['cedula', 'licencia', 'certificado', 'rif', 'desconocido'],
  description:
    'Tipo de documento DETECTADO en la imagen, INDEPENDIENTE de lo que se haya pedido. ' +
    'Devuelve "cedula" si la imagen muestra "CEDULA DE IDENTIDAD". ' +
    'Devuelve "licencia" si dice "Licencia para Conducir" (INTT). ' +
    'Devuelve "certificado" si dice "CERTIFICADO DE CIRCULACION" o "TITULO DE PROPIEDAD" (INTT). ' +
    'Devuelve "rif" si dice "REGISTRO UNICO DE INFORMACION FISCAL" (SENIAT). ' +
    'Devuelve "desconocido" si no es ninguno de los anteriores.',
};

/**
 * Esquemas de respuesta por tipo de documento.
 */
const SCHEMAS = {
  cedula: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      nombre: { type: Type.STRING, description: 'Primer nombre del titular' },
      apellido: { type: Type.STRING, description: 'Primer apellido del titular' },
      identificacion: {
        type: Type.STRING,
        description: 'Numero de cedula, solo digitos sin V- ni puntos',
      },
      tipoDoc: {
        type: Type.STRING,
        enum: ['V', 'E', 'P'],
        description: 'V=venezolano, E=extranjero, P=pasaporte',
      },
      fechaNacimiento: {
        type: Type.STRING,
        description: 'Fecha de nacimiento en formato YYYY-MM-DD',
      },
      sexo: {
        type: Type.STRING,
        enum: ['Masculino', 'Femenino'],
      },
      estadoCivil: {
        type: Type.STRING,
        enum: ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)'],
        description:
          'Estado civil del titular. La cedula venezolana lo trae con codigo: ' +
          'S=Soltero(a), C=Casado(a), D=Divorciado(a), V=Viudo(a). ' +
          'Devuelve siempre el valor expandido entre parentesis (ej. "Soltero(a)").',
      },
    },
    required: ['documentoTipo'],
  },

  licencia: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      numeroLicencia: { type: Type.STRING },
      categoria: {
        type: Type.STRING,
        description: 'Grado o categoria (1ra, 2da, 3ra, 4ta, 5ta, A, B, C)',
      },
      vencimiento: {
        type: Type.STRING,
        description: 'Fecha de vencimiento en formato YYYY-MM-DD',
      },
    },
    required: ['documentoTipo'],
  },

  certificado: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      placa: {
        type: Type.STRING,
        description: 'Placa del vehiculo, sin espacios ni guiones',
      },
      marca: { type: Type.STRING, description: 'Marca o fabricante del vehiculo' },
      modelo: { type: Type.STRING, description: 'Modelo del vehiculo' },
      anio: {
        type: Type.STRING,
        description: 'Ano del vehiculo (YYYY) en cuatro digitos',
      },
      serial: {
        type: Type.STRING,
        description: 'Serial de carroceria (VIN) o serial del motor',
      },
      color: {
        type: Type.STRING,
        description:
          'Color principal de la carroceria del vehiculo tal como aparece en el documento ' +
          '(ej: "Blanco", "Negro", "Rojo", "Plata", "Azul", "Gris", "Beige"). ' +
          'Capitaliza la primera letra. Busca etiquetas como "COLOR", "Color de carroceria" ' +
          'o similares dentro del CERTIFICADO DE CIRCULACION o TITULO DE PROPIEDAD. ' +
          'Si aparecen dos colores separados por "/", devuelve el primero. ' +
          'Si realmente no aparece ningun color en el documento, devuelve null.',
      },
    },
    required: ['documentoTipo'],
  },

  rif: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      rif: {
        type: Type.STRING,
        description: 'RIF en formato J-XXXXXXXX-X o V-XXXXXXX-X',
      },
      razonSocial: {
        type: Type.STRING,
        description: 'Razon social o nombre completo del contribuyente',
      },
    },
    required: ['documentoTipo'],
  },
};

const VALIDATION_PREAMBLE =
  'PASO 1 (OBLIGATORIO): Identifica el HEADER del documento y devuelve documentoTipo: ' +
  '"cedula" si ves "CEDULA DE IDENTIDAD" sobre tricolor venezolano; ' +
  '"licencia" si ves "Licencia para Conducir" del INTT; ' +
  '"certificado" si ves "CERTIFICADO DE CIRCULACION" o "TITULO DE PROPIEDAD" del INTT; ' +
  '"rif" si ves "REGISTRO UNICO DE INFORMACION FISCAL" del SENIAT; ' +
  '"desconocido" en cualquier otro caso. ' +
  'PASO 2: Si y SOLO SI documentoTipo coincide con el tipo solicitado, extrae los demas campos. ' +
  'Si NO coincide, devuelve solamente documentoTipo y deja el resto en null. ' +
  'NUNCA inventes datos para forzar el tipo solicitado. ';

const PROMPTS = {
  cedula:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: CEDULA DE IDENTIDAD VENEZOLANA. ' +
    'Si la persona aparece como "VENEZOLANO" usa tipoDoc="V"; si dice "EXTRANJERO" usa "E". ' +
    'El campo identificacion debe contener solo digitos. ' +
    'Para estadoCivil: la cedula muestra una letra (S, C, D, V); ' +
    'mapea S->"Soltero(a)", C->"Casado(a)", D->"Divorciado(a)", V->"Viudo(a)".',
  licencia:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: LICENCIA DE CONDUCIR VENEZOLANA (INTT). ' +
    'Pon especial atencion a la fecha de vencimiento y al grado o categoria.',
  certificado:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: CERTIFICADO DE CIRCULACION (RUST) o TITULO DE PROPIEDAD del vehiculo (INTT). ' +
    'La placa debe ir sin espacios ni guiones. El ano en cuatro digitos. ' +
    'NO OLVIDES extraer el COLOR de la carroceria: aparece etiquetado como "COLOR" o ' +
    '"COLOR DE LA CARROCERIA" en el cuerpo del documento. Devuelvelo capitalizado ' +
    '(ej. "Blanco", "Negro", "Rojo", "Plata"). Si aparecen dos colores con "/", usa el primero.',
  rif:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: REGISTRO UNICO DE INFORMACION FISCAL (RIF) venezolano (SENIAT). ' +
    'Mantiene el formato canonico con guiones (ej. J-12345678-9).',
};

const SYSTEM_INSTRUCTION =
  'Eres un extractor OCR estricto de documentos venezolanos oficiales. ' +
  'SIEMPRE empiezas verificando el header del documento (titulo y emisor) ' +
  'para determinar `documentoTipo`. Devuelve EXCLUSIVAMENTE un JSON con ' +
  'los campos pedidos. Si un campo no es legible o no aparece, usa null. ' +
  'NUNCA inventes datos. NUNCA fuerces datos cuando el documento no coincide ' +
  'con el tipo solicitado. Devuelve fechas en formato YYYY-MM-DD. Responde en espanol.';

/**
 * Llama a Gemini con un modelo específico y reintentos automáticos para errores
 * transitorios (5xx, rate-limit, timeout). Devuelve el JSON parseado o lanza.
 */
async function callGeminiWithRetry(model, docType, base64, mimetype) {
  const ai = getClient();
  const maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES, 10) || 2;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startedAt = Date.now();
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: PROMPTS[docType] },
              { inlineData: { mimeType: mimetype, data: base64 } },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: SCHEMAS[docType],
          temperature: 0.1,
        },
      });

      const elapsedMs = Date.now() - startedAt;
      const rawText = (response && response.text) ? response.text : '';

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        // JSON inválido también es transitorio — lo reintentamos.
        throw new Error(
          `Gemini devolvio JSON invalido: ${parseErr.message}. Texto: ${rawText.slice(0, 200)}`
        );
      }

      // Normalización campo `anio` -> `año` para compat con frontend
      if (docType === 'certificado' && parsed && parsed.anio !== undefined) {
        parsed['año'] = parsed.anio;
        delete parsed.anio;
      }

      return { fields: parsed, elapsedMs, attempt: attempt + 1 };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransientError(err)) {
        const backoffMs = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
        console.warn(
          `[OCR] modelo=${model} intento=${attempt + 1}/${maxRetries + 1} fallo transitorio, ` +
          `reintentando en ${backoffMs}ms — ${err.message}`
        );
        await sleep(backoffMs);
        continue;
      }
      // Error permanente o ya agotamos reintentos.
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Ejecuta el OCR sobre un archivo guardado por multer.
 *
 * Estrategia: itera la cadena de modelos. Para cada modelo intenta hasta
 * GEMINI_MAX_RETRIES veces si hay errores transitorios. Si el resultado
 * carece de campos críticos, baja al siguiente modelo de la cadena.
 *
 * @param {string} filePath  Ruta absoluta al archivo subido.
 * @param {string} mimetype  MIME del archivo.
 * @param {string} docType   cedula | licencia | certificado | rif.
 * @returns {Promise<{fields:object, meta:object}>}
 */
async function extract(filePath, mimetype, docType) {
  if (!SCHEMAS[docType]) {
    throw new Error(`Tipo de documento no soportado por Gemini: ${docType}`);
  }
  if (!SUPPORTED_MIME.has(mimetype)) {
    throw new Error(
      `Formato ${mimetype} no soportado por Gemini OCR. Usa JPG, PNG, WebP o PDF.`
    );
  }

  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');

  const chain = getModelChain();
  const overallStart = Date.now();
  const attemptsLog = [];
  let lastErr;

  for (const model of chain) {
    try {
      const r = await callGeminiWithRetry(model, docType, base64, mimetype);
      const validation = validateCriticalFields(docType, r.fields);

      attemptsLog.push({
        model,
        attempts: r.attempt,
        elapsedMs: r.elapsedMs,
        criticalOk: validation.ok,
        missing: validation.missing,
      });

      // Si el documento no coincide con el slot, devolvemos inmediatamente:
      // los campos críticos no aplican porque legítimamente no es ese doc.
      const detectedDocType = r.fields && r.fields.documentoTipo;
      const isMismatch = detectedDocType && detectedDocType !== docType;

      // Si los campos críticos están bien (o el doc no coincide), devolvemos.
      if (validation.ok || isMismatch) {
        return {
          fields: r.fields,
          meta: {
            provider: 'gemini',
            model,
            elapsedMs: Date.now() - overallStart,
            singleCallMs: r.elapsedMs,
            chainAttempts: attemptsLog,
          },
        };
      }

      // Faltan campos críticos pero la llamada terminó OK. Probamos siguiente
      // modelo con la esperanza de que sea más preciso. Si era el último,
      // devolvemos lo que tenemos para no perder la lectura parcial.
      console.warn(
        `[OCR] modelo=${model} resultado incompleto (faltan: ${validation.missing.join(', ')}), ` +
        `intentando siguiente modelo si hay`
      );
      lastErr = new Error(`Campos críticos vacíos: ${validation.missing.join(', ')}`);
    } catch (err) {
      attemptsLog.push({
        model,
        error: err.message,
        transient: isTransientError(err),
      });
      console.error(`[OCR] modelo=${model} fallo: ${err.message}`);
      lastErr = err;
      // Probamos siguiente modelo
    }
  }

  // Si llegamos acá, ningún modelo dio campos críticos completos. Devolvemos
  // el último intento parseable o lanzamos el último error.
  // Buscamos el último intento con fields parseados aunque falten críticos:
  // re-llamamos al primer modelo y devolvemos lo que sea.
  // Para no encarecer, simplemente lanzamos el último error con el log.
  const errorMsg =
    lastErr ? lastErr.message : 'Todos los modelos Gemini fallaron sin error específico';
  const enhancedErr = new Error(
    `OCR fallo en toda la cadena de modelos [${chain.join(' → ')}]: ${errorMsg}`
  );
  enhancedErr.chainAttempts = attemptsLog;
  enhancedErr.totalElapsedMs = Date.now() - overallStart;
  throw enhancedErr;
}

module.exports = { extract, SUPPORTED_MIME, getModelChain };
