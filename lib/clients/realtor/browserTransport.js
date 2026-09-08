import puppeteer from 'puppeteer';
import path from 'node:path';
import {
  RealtorChallengeError,
  RealtorResponseError,
  RealtorTransportError,
} from './errors.js';

const DEFAULT_SITE_URL = 'https://www.realtor.ca';
const DEFAULT_API_BASE_URL = 'https://api2.realtor.ca';

const challengeText = (value) => {
  const text = String(value || '').toLowerCase();
  return (
    text.includes('just a moment') ||
    text.includes('checking your browser') ||
    text.includes('verify you are human') ||
    text.includes('sorry, you have been blocked') ||
    text.includes('cloudflare') ||
    text.includes('cf-chl')
  );
};

export class RealtorBrowserTransport {
  constructor({
    puppeteer: puppeteerInstance = puppeteer,
    userDataDir = path.resolve('db/browser/realtor'),
    headless = true,
    timeoutMs = 30_000,
    executablePath = undefined,
    siteUrl = DEFAULT_SITE_URL,
    apiBaseUrl = DEFAULT_API_BASE_URL,
  } = {}) {
    if (puppeteerInstance == null || typeof puppeteerInstance.launch !== 'function') {
      throw new RealtorTransportError('RealtorBrowserTransport requires a Puppeteer-compatible launcher');
    }

    this.puppeteer = puppeteerInstance;
    this.userDataDir = userDataDir;
    this.headless = headless;
    this.timeoutMs = timeoutMs;
    this.executablePath = executablePath;
    this.siteUrl = siteUrl.replace(/\/$/, '');
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.browser = null;
    this.page = null;
    this.originLoaded = false;
  }

  async #launch() {
    if (this.browser != null) return;

    try {
      this.browser = await this.puppeteer.launch({
        headless: this.headless,
        userDataDir: this.userDataDir,
        executablePath: this.executablePath,
        timeout: this.timeoutMs,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      this.page = await this.browser.newPage();
    } catch (error) {
      await this.close();
      throw new RealtorTransportError('Unable to launch the Realtor.ca browser session', { cause: error });
    }
  }

  async #assertOriginIsUsable(response) {
    const status = response?.status?.() ?? 200;
    const [title, content] = await Promise.all([
      this.page.title().catch(() => ''),
      this.page.content().catch(() => ''),
    ]);

    if (status === 403 || challengeText(title) || challengeText(content)) {
      throw new RealtorChallengeError(
        'Realtor.ca presented a browser challenge. Open the persistent browser profile interactively and complete it before retrying.',
        { status },
      );
    }

    if (status >= 400) {
      throw new RealtorTransportError(`Realtor.ca origin returned HTTP ${status}`, { status });
    }
  }

  async #ensureOrigin() {
    await this.#launch();
    if (this.originLoaded) return;

    let response;
    try {
      response = await this.page.goto(`${this.siteUrl}/`, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeoutMs,
      });
      await this.#assertOriginIsUsable(response);
      this.originLoaded = true;
    } catch (error) {
      if (error instanceof RealtorChallengeError || error instanceof RealtorTransportError) throw error;
      throw new RealtorTransportError('Unable to load Realtor.ca in the browser session', { cause: error });
    }
  }

  async request({ method = 'GET', path: requestPath, query = null, form = null } = {}) {
    if (typeof requestPath !== 'string' || !requestPath.startsWith('/')) {
      throw new RealtorTransportError('Realtor request path must start with /');
    }

    const normalizedMethod = String(method).toUpperCase();
    if (!['GET', 'POST'].includes(normalizedMethod)) {
      throw new RealtorTransportError(`Unsupported Realtor request method: ${normalizedMethod}`);
    }

    await this.#ensureOrigin();

    let response;
    try {
      response = await this.page.evaluate(
        async ({ apiBaseUrl, method: browserMethod, path: browserPath, query: browserQuery, form: browserForm }) => {
          const url = new URL(browserPath, apiBaseUrl);
          if (browserQuery != null) {
            for (const [key, value] of Object.entries(browserQuery)) {
              if (value != null) url.searchParams.set(key, String(value));
            }
          }

          const options = {
            method: browserMethod,
            credentials: 'include',
            redirect: 'follow',
            headers: {},
          };

          if (browserMethod === 'POST') {
            const body = new URLSearchParams();
            for (const [key, value] of Object.entries(browserForm || {})) {
              if (value != null) body.set(key, String(value));
            }
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            options.body = body.toString();
          }

          const result = await fetch(url.toString(), options);
          return {
            status: result.status,
            contentType: result.headers.get('content-type') || '',
            text: await result.text(),
          };
        },
        {
          apiBaseUrl: this.apiBaseUrl,
          method: normalizedMethod,
          path: requestPath,
          query,
          form,
        },
      );
    } catch (error) {
      throw new RealtorTransportError('Realtor.ca browser-context request failed', { cause: error });
    }

    const status = Number(response?.status);
    const body = response?.text ?? '';
    if (status === 401 || status === 403 || challengeText(body)) {
      this.originLoaded = false;
      throw new RealtorChallengeError('Realtor.ca rejected the browser session with a challenge', { status });
    }

    if (!Number.isFinite(status) || status < 200 || status >= 300) {
      throw new RealtorTransportError(`Realtor.ca API returned HTTP ${Number.isFinite(status) ? status : 'unknown'}`, {
        status: Number.isFinite(status) ? status : null,
      });
    }

    try {
      return JSON.parse(body);
    } catch (error) {
      throw new RealtorResponseError('Realtor.ca returned a non-JSON API response', { status, cause: error });
    }
  }

  async close() {
    const page = this.page;
    const browser = this.browser;
    this.page = null;
    this.browser = null;
    this.originLoaded = false;

    try {
      if (page != null) await page.close();
    } catch {
      // Browser shutdown is best-effort.
    }
    try {
      if (browser != null) await browser.close();
    } catch {
      // Browser shutdown is best-effort.
    }
  }
}
