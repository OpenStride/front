/**
 * ShareUrlService
 *
 * Service for wrapping/unwrapping manifest URLs for friend sharing via deep links.
 * Transforms direct Google Drive URLs into app URLs that enable automatic app opening.
 *
 * URL Formats:
 * - Direct (old): https://drive.google.com/uc?id=ABC123&export=download
 * - Share (new):  https://openstride.org/add-friend?manifest=<encoded_url>
 *
 * Supports backward compatibility with both formats.
 */
export class ShareUrlService {
  /**
   * Get the configured base URL for the app
   * Uses VITE_APP_BASE_URL env var in production, falls back to window.location.origin in dev
   *
   * @returns Base URL without trailing slash (e.g., https://openstride.org)
   */
  static getBaseUrl(): string {
    const envBaseUrl = import.meta.env.VITE_APP_BASE_URL;

    // Use environment variable if set and not placeholder
    if (envBaseUrl && envBaseUrl !== 'undefined') {
      return envBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    // Fallback to current origin (for localhost development)
    return window.location.origin;
  }

  /**
   * Wrap a Google Drive manifest URL into an app share URL
   *
   * @param manifestUrl Direct Google Drive URL to manifest.json
   * @returns App share URL with manifest as query parameter
   *
   * @example
   * wrapManifestUrl('https://drive.google.com/uc?id=ABC123')
   * // Returns: 'https://openstride.org/add-friend?manifest=https%3A%2F%2Fdrive.google.com...'
   */
  static wrapManifestUrl(manifestUrl: string): string {
    const base = this.getBaseUrl();
    const encoded = encodeURIComponent(manifestUrl);
    return `${base}/add-friend?manifest=${encoded}`;
  }

  /**
   * Unwrap an app share URL to extract the manifest URL
   *
   * @param shareUrl App share URL with manifest parameter
   * @returns Direct manifest URL, or null if invalid format
   *
   * @example
   * unwrapManifestUrl('https://openstride.org/add-friend?manifest=...')
   * // Returns: 'https://drive.google.com/uc?id=ABC123'
   */
  static unwrapManifestUrl(shareUrl: string): string | null {
    try {
      const parsed = new URL(shareUrl);

      // Check if this is an /add-friend route
      if (parsed.pathname !== '/add-friend') {
        return null;
      }

      // Extract manifest parameter
      // Note: searchParams.get() already decodes the value automatically
      const manifestParam = parsed.searchParams.get('manifest');
      if (!manifestParam) {
        return null;
      }

      return manifestParam;
    } catch (error) {
      console.error('[ShareUrlService] Failed to unwrap URL:', error);
      return null;
    }
  }

  /**
   * Detect if a URL is an app share URL (vs direct manifest URL)
   *
   * @param url URL to check
   * @returns true if this is an app share URL with /add-friend path
   *
   * @example
   * isShareUrl('https://openstride.org/add-friend?manifest=...') // true
   * isShareUrl('https://drive.google.com/uc?id=ABC')              // false
   */
  static isShareUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.pathname === '/add-friend' && parsed.searchParams.has('manifest');
    } catch (error) {
      // Invalid URL format, treat as not a share URL
      return false;
    }
  }

  /**
   * Validate that a manifest URL is from an allowed Google Drive domain
   * Prevents open redirect attacks and ensures URL points to Google Drive
   *
   * @param url URL to validate
   * @returns true if URL is a valid Google Drive URL
   *
   * @example
   * isValidManifestUrl('https://drive.google.com/uc?id=ABC')  // true
   * isValidManifestUrl('https://evil.com/manifest.json')       // false
   */
  static isValidManifestUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Allow Google Drive domains for production
      const allowedHosts = [
        'drive.google.com',
        'docs.google.com'
      ];

      // In development, also allow localhost for testing
      if (import.meta.env.DEV) {
        allowedHosts.push('localhost', '127.0.0.1');
      }

      return allowedHosts.includes(parsed.hostname);
    } catch (error) {
      // Invalid URL format
      return false;
    }
  }
}
