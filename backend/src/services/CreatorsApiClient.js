/**
 * CreatorsApiClient
 *
 * Minimal reusable client foundation for the Amazon Creators API.
 *
 * IMPORTANT:
 *  - This is NOT the PA-API (Product Advertising API).
 *  - This does NOT use AWS SigV4 / AccessKey authentication.
 *  - This uses Amazon Creators API OAuth 2.0 client-credentials flow.
 *
 * Required environment variables:
 *   AMAZON_CREDENTIAL_ID   - OAuth client id (Credential ID)
 *   AMAZON_SECRET          - OAuth client secret
 *   AMAZON_API_VERSION     - Creators API version segment, e.g. 'v1'
 *
 * Optional environment variables:
 *   AMAZON_API_SCOPE       - OAuth scope override (defaults to creatorsapi::default)
 *   AMAZON_API_BASE_URL    - API base URL override (defaults to https://creatorsapi.amazon)
 *   AMAZON_API_MARKETPLACE - Marketplace domain for x-marketplace header (defaults to www.amazon.com)
 *
 * The class:
 *   - Requests an OAuth bearer token from the Amazon auth token endpoint.
 *   - Caches the token in memory.
 *   - Refreshes before expiration (safe margin).
 *   - Exposes getAccessToken() and a generic request() helper for future endpoints.
 *   - Fails cleanly (typed errors) when required env vars are missing.
 *   - Logs useful information without ever logging secrets or token values.
 */

const AMAZON_TOKEN_ENDPOINT = 'https://api.amazon.com/auth/o2/token';
const DEFAULT_SCOPE = 'creatorsapi::default';
const DEFAULT_API_BASE_URL = 'https://creatorsapi.amazon';
const DEFAULT_MARKETPLACE = 'www.amazon.com';
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000; // Refresh 60s before expiry
const DEFAULT_EXPIRES_IN_S = 3600;

class CreatorsApiClient {
  /**
   * @param {object} [options]
   *   - scope: OAuth scope override (defaults to env AMAZON_API_SCOPE or creatorsapi::default)
   *   - baseUrl: API base URL override (defaults to env AMAZON_API_BASE_URL or https://creatorsapi.amazon)
   *   - marketplace: Marketplace domain for x-marketplace header (defaults to env AMAZON_API_MARKETPLACE or www.amazon.com)
   */
  constructor(options = {}) {
    this.credentialId = process.env.AMAZON_CREDENTIAL_ID || '';
    this.secret = process.env.AMAZON_SECRET || '';
    this.apiVersion = process.env.AMAZON_API_VERSION || '';
    this.scope = options.scope || process.env.AMAZON_API_SCOPE || DEFAULT_SCOPE;
    this.baseUrl = options.baseUrl || process.env.AMAZON_API_BASE_URL || DEFAULT_API_BASE_URL;
    this.marketplace = options.marketplace || process.env.AMAZON_API_MARKETPLACE || DEFAULT_MARKETPLACE;

    // In-memory token cache: { accessToken, expiresAt }
    this._token = null;
    // Deduplicates concurrent getAccessToken() calls
    this._tokenPromise = null;

    // Determine which required vars are missing (names only — never values).
    this._missing = this._computeMissingEnvVars();

    if (this._missing.length > 0) {
      console.warn(`[CreatorsApiClient] Missing required env var(s): ${this._missing.join(', ')}. Token/API calls will fail cleanly until configured.`);
    } else {
      console.log(`[CreatorsApiClient] Initialized (API version: ${this.apiVersion}).`);
    }
  }

  /**
   * Recompute missing required env vars from the current environment.
   * Names only — never values.
   */
  _computeMissingEnvVars() {
    const missing = [];
    if (!process.env.AMAZON_CREDENTIAL_ID) missing.push('AMAZON_CREDENTIAL_ID');
    if (!process.env.AMAZON_SECRET) missing.push('AMAZON_SECRET');
    if (!process.env.AMAZON_API_VERSION) missing.push('AMAZON_API_VERSION');
    return missing;
  }

  /** True when all required env vars are present (checked against current env). */
  get isConfigured() {
    this._missing = this._computeMissingEnvVars();
    return this._missing.length === 0;
  }

  /**
   * Returns the missing required env var names (for error messages/logging).
   * Never includes values.
   */
  get missingEnvVars() {
    this._missing = this._computeMissingEnvVars();
    return [...this._missing];
  }

  /** Throws a typed error when required env vars are absent. */
  _assertConfigured() {
    if (!this.isConfigured) {
      const err = new Error(`Amazon Creators API client is not configured. Missing: ${this._missing.join(', ')}`);
      err.name = 'CreatorsApiConfigError';
      err.code = 'CREATORS_API_NOT_CONFIGURED';
      throw err;
    }
  }

  /**
   * Returns a valid OAuth bearer token.
   * Uses the cached token when still valid; otherwise fetches a new one.
   * Concurrent callers share a single in-flight token request.
   *
   * @returns {Promise<string>} bearer token
   */
  async getAccessToken() {
    this._assertConfigured();

    const cached = this._token;
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return cached.accessToken;
    }

    if (!this._tokenPromise) {
      this._tokenPromise = this._fetchAccessToken().finally(() => {
        this._tokenPromise = null;
      });
    }

    return this._tokenPromise;
  }

  /**
   * Requests a new OAuth token from the Amazon auth endpoint.
   *
   * @returns {Promise<string>} bearer token
   */
  async _fetchAccessToken() {
    this._assertConfigured();

    const body = JSON.stringify({
      grant_type: 'client_credentials',
      client_id: this.credentialId,
      client_secret: this.secret,
      scope: this.scope
    });

    let response;
    try {
      response = await fetch(AMAZON_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
    } catch (err) {
      const error = new Error(`Amazon Creators API token request failed (network): ${err.message}`);
      error.name = 'CreatorsApiTokenError';
      error.code = 'CREATORS_API_TOKEN_NETWORK_ERROR';
      throw error;
    }

    const text = await response.text().catch(() => '');
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (!response.ok) {
      const details = (data && data.error_description) || (data && data.error) || '';
      const error = new Error(`Amazon Creators API token request failed with HTTP ${response.status}${details ? `: ${details}` : ''}`);
      error.name = 'CreatorsApiTokenError';
      error.code = 'CREATORS_API_TOKEN_HTTP_ERROR';
      error.status = response.status;
      throw error;
    }

    if (!data || typeof data.access_token !== 'string' || data.access_token.length === 0) {
      const error = new Error('Amazon Creators API token response did not include access_token');
      error.name = 'CreatorsApiTokenError';
      error.code = 'CREATORS_API_TOKEN_BAD_RESPONSE';
      throw error;
    }

    const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : DEFAULT_EXPIRES_IN_S;
    this._token = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000
    };

    console.log(`[CreatorsApiClient] OAuth token acquired (expires in ${expiresIn}s).`);
    return this._token.accessToken;
  }

  /**
   * Generic request helper for future Creators API calls.
   *
   * @param {string} path - API path relative to the versioned base, e.g. 'products'
   * @param {object} [options] - fetch options (method, headers, body). body is JSON-serialized.
   * @returns {Promise<object|string|null>} parsed JSON response, raw text, or null
   */
  async request(path, options = {}) {
    this._assertConfigured();

    const url = this._buildUrl(path);

    try {
      const token = await this.getAccessToken();
      return await this._send(url, options, token);
    } catch (err) {
      if (err && err.code === 'CREATORS_API_UNAUTHORIZED') {
        // Token expired/invalid: clear cache and retry once with a fresh token.
        console.log('[CreatorsApiClient] Received 401 — refreshing token and retrying once.');
        this._token = null;
        const token = await this.getAccessToken();
        return await this._send(url, options, token);
      }
      throw err;
    }
  }

  /**
   * Performs a single fetch with the given bearer token.
   */
  async _send(url, options, token) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-marketplace': this.marketplace,
      ...(options.headers || {})
    };

    const fetchOptions = { ...options, headers };
    if (options.body !== undefined && options.body !== null) {
      fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (err) {
      const error = new Error(`Amazon Creators API request failed (network): ${err.message}`);
      error.name = 'CreatorsApiRequestError';
      error.code = 'CREATORS_API_NETWORK_ERROR';
      throw error;
    }

    const text = await response.text().catch(() => '');

    if (response.status === 401) {
      const error = new Error('Amazon Creators API request was unauthorized (HTTP 401)');
      error.name = 'CreatorsApiRequestError';
      error.code = 'CREATORS_API_UNAUTHORIZED';
      error.status = response.status;
      throw error;
    }

    if (!response.ok) {
      const snippet = text ? `: ${text.slice(0, 300)}` : '';
      const error = new Error(`Amazon Creators API request failed with HTTP ${response.status}${snippet}`);
      error.name = 'CreatorsApiRequestError';
      error.code = 'CREATORS_API_HTTP_ERROR';
      error.status = response.status;
      throw error;
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Builds a full URL: base URL + version + normalized path.
   */
  _buildUrl(path) {
    const base = String(this.baseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
    const version = String(this.apiVersion || '').replace(/^\/+|\/+$/g, '');
    const cleanedPath = String(path || '').replace(/^\/+/, '');
    const segments = [base];
    if (version) segments.push(version);
    if (cleanedPath) segments.push(cleanedPath);
    return segments.join('/');
  }
}

module.exports = { CreatorsApiClient };