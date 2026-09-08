/**
 * TEMPORARY — Phase 12.6.7 production diagnostic endpoint (STRICTLY READ-ONLY).
 *
 * REMOVE THIS FILE AND ITS app.js MOUNT AFTER the production diagnostic has
 * been collected. This route exists ONLY because Render Free has no shell
 * access, so the diagnostic report must be retrievable through the deployed
 * web service.
 *
 * SECURITY MODEL
 * --------------
 *  - Requires `Authorization: Bearer <STOCKSPOT_DIAGNOSTIC_TOKEN>`.
 *  - The token is read ONLY from process.env.STOCKSPOT_DIAGNOSTIC_TOKEN.
 *    It is never hard-coded, never accepted via query parameters, and never
 *    logged or echoed.
 *  - When the env var is not configured the endpoint is disabled (HTTP 503).
 *  - Constant-time token comparison (timing-safe).
 *  - Rate-limited with the already-installed express-rate-limit dependency.
 *  - The endpoint accepts NO query parameters, collection names, filters,
 *    JavaScript, commands, or request bodies. HTTP input cannot influence the
 *    MongoDB operations performed — it can only trigger the one hard-coded,
 *    read-only diagnostic script.
 *  - The diagnostic runs on the server's existing mongoose connection and the
 *    connection is NEVER closed, recreated, or disconnected by this route.
 *  - Failures return HTTP 500 with a sanitized error. MONGO_URI and any
 *    credentials/tokens are never included in responses.
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  runDiagnostic,
  resetDiagnosticReport,
  stopDiagnosticReport,
  getDiagnosticReport
} = require(path.resolve(__dirname, '..', '..', '..', 'scripts', 'phase-12-6-7-production-diagnostic.js'));

const router = express.Router();

const WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const MAX_REQUESTS = 5;             // extremely tight by design (temp endpoint)

const diagnosticLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded for the diagnostic endpoint'
  }
});

// Single-flight guard: only one diagnostic run at a time in this process.
let diagnosticRunning = false;

/**
 * Constant-time token comparison. Never leaks length/timing of the token.
 */
function safeTokenEqual(provided, expected) {
  const bufA = Buffer.from(String(provided), 'utf8');
  const bufB = Buffer.from(String(expected), 'utf8');
  if (bufA.length !== bufB.length) {
    // Burn comparable time even on length mismatch.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Defensive sanitizer so an unexpected error can never expose a connection
 * string or credentials. The diagnostic script already sanitizes internally;
 * this is a second line of defense at the HTTP boundary.
 */
function sanitizeBoundaryMessage(value) {
  let s = String((value && value.message) || value || 'diagnostic failed');
  s = s.replace(/(mongodb(\+srv)?:\/\/)[^\s"'`]+/gi, '$1<REDACTED>');
  s = s.replace(/(\/\/)[^@\s/]+@/g, '$1<REDACTED>@');
  s = s.replace(/((?:api[_-]?key|password|token|secret)\s*[:=]\s*)\S+/gi, '$1<REDACTED>');
  return s;
}

/**
 * GET /api/admin/phase-12-6-7-diagnostic
 *
 * Authorization: Bearer <STOCKSPOT_DIAGNOSTIC_TOKEN>
 * Returns:       { success: true, diagnostic: "<full diagnostic report>" }
 */
router.get('/phase-12-6-7-diagnostic', diagnosticLimiter, async (req, res) => {
  const expectedToken = process.env.STOCKSPOT_DIAGNOSTIC_TOKEN;

  if (!expectedToken) {
    return res.status(503).json({
      success: false,
      error: 'Diagnostic endpoint is not configured (STOCKSPOT_DIAGNOSTIC_TOKEN is not set)'
    });
  }

  const authHeader = req.get('authorization') || '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (!providedToken || !safeTokenEqual(providedToken, expectedToken)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (diagnosticRunning) {
    return res.status(429).json({ success: false, error: 'Diagnostic already running' });
  }

  diagnosticRunning = true;
  resetDiagnosticReport();

  try {
    const result = await runDiagnostic({ closeConnection: false });
    const report = getDiagnosticReport();

    if (!result || result.ok !== true) {
      const failure = (result && result.error) ? result.error : 'diagnostic failed';
      return res.status(500).json({
        success: false,
        error: sanitizeBoundaryMessage(failure),
        diagnostic: report
      });
    }

    return res.json({ success: true, diagnostic: report });
  } catch (err) {
    const report = getDiagnosticReport();
    return res.status(500).json({
      success: false,
      error: sanitizeBoundaryMessage(err),
      diagnostic: report
    });
  } finally {
    stopDiagnosticReport();
    diagnosticRunning = false;
  }
});

module.exports = router;