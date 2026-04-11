/**
 * Playwright Browser Manager
 * Handles browser lifecycle, context creation with proxy support,
 * and graceful shutdown
 */

const playwright = require('playwright');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize browser with proxy configuration
   * @param {Object} proxyConfig - { server, username, password }
   */
  async initialize(proxyConfig = {}) {
    try {
      this.isShuttingDown = false;
      console.log('[BrowserManager] Initializing Chromium browser...');

      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Important for Railway/Linux environments
          '--disable-gpu',
          '--single-process',
        ],
      };

      // Add proxy if configured
      if (proxyConfig.server) {
        launchOptions.proxy = {
          server: proxyConfig.server,
        };

        if (proxyConfig.username && proxyConfig.password) {
          launchOptions.proxy.username = proxyConfig.username;
          launchOptions.proxy.password = proxyConfig.password;
        }

        console.log('[BrowserManager] Proxy configured:', proxyConfig.server);
      }

      this.browser = await playwright.chromium.launch(launchOptions);
      console.log('[BrowserManager] Browser initialized successfully');

      return this.browser;
    } catch (error) {
      console.error('[BrowserManager] Failed to initialize browser:', error.message);
      throw error;
    }
  }

  /**
   * Create a new browser context with optional proxy
   * Useful for isolated sessions
   */
  async createContext(proxyConfig = {}) {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      const contextOptions = {
        // Mimic real browser
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      // Add proxy to context if needed (in addition to browser-level proxy)
      if (proxyConfig.server) {
        contextOptions.proxy = {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      const context = await this.browser.newContext(contextOptions);
      return context;
    } catch (error) {
      console.error('[BrowserManager] Failed to create context:', error.message);
      throw error;
    }
  }

  /**
   * Create a new page from default context
   * Browser-level context is created on first use
   */
  async createPage() {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      // Create a page using default context
      const page = await this.browser.newPage();

      // Set realistic timing
      page.setDefaultTimeout(30000); // 30 second timeout
      page.setDefaultNavigationTimeout(30000);

      return page;
    } catch (error) {
      console.error('[BrowserManager] Failed to create page:', error.message);
      throw error;
    }
  }

  /**
   * Close a page and clean up resources
   */
  async closePage(page) {
    if (page) {
      try {
        await page.close();
      } catch (error) {
        console.warn('[BrowserManager] Warning closing page:', error.message);
      }
    }
  }

  /**
   * Check if browser is running
   */
  isConnected() {
    return this.browser && this.browser.isConnected();
  }

  /**
   * Gracefully shutdown browser
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log('[BrowserManager] Initiating graceful shutdown...');

    try {
      if (this.browser) {
        await this.browser.close();
        console.log('[BrowserManager] Browser closed successfully');
      }
    } catch (error) {
      console.error('[BrowserManager] Error during shutdown:', error.message);
    } finally {
      this.browser = null;
      this.isShuttingDown = false;
    }
  }

  /**
   * Restart browser process after crash/disconnect.
   */
  async restart(proxyConfig = {}) {
    await this.shutdown();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.initialize(proxyConfig);
  }
}

// Export singleton instance
module.exports = new BrowserManager();
