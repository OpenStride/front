import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShareUrlService } from '@/services/ShareUrlService';

describe('ShareUrlService', () => {
  // Store original environment variable
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = import.meta.env.VITE_APP_BASE_URL;
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      import.meta.env.VITE_APP_BASE_URL = originalEnv;
    }
  });

  describe('getBaseUrl', () => {
    it('should use VITE_APP_BASE_URL when set', () => {
      import.meta.env.VITE_APP_BASE_URL = 'https://openstride.org';
      expect(ShareUrlService.getBaseUrl()).toBe('https://openstride.org');
    });

    it('should remove trailing slash from VITE_APP_BASE_URL', () => {
      import.meta.env.VITE_APP_BASE_URL = 'https://openstride.org/';
      expect(ShareUrlService.getBaseUrl()).toBe('https://openstride.org');
    });

    it('should fallback to window.location.origin when env var not set', () => {
      import.meta.env.VITE_APP_BASE_URL = undefined;
      expect(ShareUrlService.getBaseUrl()).toBe(window.location.origin);
    });

    it('should fallback when env var is string "undefined"', () => {
      import.meta.env.VITE_APP_BASE_URL = 'undefined';
      expect(ShareUrlService.getBaseUrl()).toBe(window.location.origin);
    });
  });

  describe('wrapManifestUrl', () => {
    beforeEach(() => {
      import.meta.env.VITE_APP_BASE_URL = 'https://openstride.org';
    });

    it('should wrap Google Drive URL in app share URL', () => {
      const manifestUrl = 'https://drive.google.com/uc?id=ABC123&export=download';
      const wrapped = ShareUrlService.wrapManifestUrl(manifestUrl);

      expect(wrapped).toContain('https://openstride.org/add-friend?manifest=');
      expect(wrapped).toContain(encodeURIComponent(manifestUrl));
    });

    it('should properly encode special characters in URL', () => {
      const manifestUrl = 'https://drive.google.com/uc?id=ABC&foo=bar';
      const wrapped = ShareUrlService.wrapManifestUrl(manifestUrl);

      expect(wrapped).toBe(
        'https://openstride.org/add-friend?manifest=' + encodeURIComponent(manifestUrl)
      );
    });

    it('should handle URLs with # and other special chars', () => {
      const manifestUrl = 'https://drive.google.com/file?id=test#abc';
      const wrapped = ShareUrlService.wrapManifestUrl(manifestUrl);

      expect(wrapped).toContain('https://openstride.org/add-friend?manifest=');
      expect(decodeURIComponent(wrapped.split('manifest=')[1])).toBe(manifestUrl);
    });
  });

  describe('unwrapManifestUrl', () => {
    it('should extract manifest URL from share URL', () => {
      const manifestUrl = 'https://drive.google.com/uc?id=ABC123';
      const shareUrl = `https://openstride.org/add-friend?manifest=${encodeURIComponent(manifestUrl)}`;

      const unwrapped = ShareUrlService.unwrapManifestUrl(shareUrl);
      expect(unwrapped).toBe(manifestUrl);
    });

    it('should return null for URL without /add-friend path', () => {
      const invalidUrl = 'https://openstride.org/friends?manifest=test';
      expect(ShareUrlService.unwrapManifestUrl(invalidUrl)).toBeNull();
    });

    it('should return null for URL without manifest parameter', () => {
      const invalidUrl = 'https://openstride.org/add-friend';
      expect(ShareUrlService.unwrapManifestUrl(invalidUrl)).toBeNull();
    });

    it('should return null for malformed URLs', () => {
      expect(ShareUrlService.unwrapManifestUrl('not a url')).toBeNull();
      expect(ShareUrlService.unwrapManifestUrl('')).toBeNull();
    });

    it('should properly decode special characters', () => {
      const manifestUrl = 'https://drive.google.com/uc?id=ABC&foo=bar';
      const shareUrl = `https://openstride.org/add-friend?manifest=${encodeURIComponent(manifestUrl)}`;

      const unwrapped = ShareUrlService.unwrapManifestUrl(shareUrl);
      expect(unwrapped).toBe(manifestUrl);
    });

    it('should handle double-encoded URLs gracefully', () => {
      const manifestUrl = 'https://drive.google.com/uc?id=ABC';
      const doubleEncoded = encodeURIComponent(encodeURIComponent(manifestUrl));
      const shareUrl = `https://openstride.org/add-friend?manifest=${doubleEncoded}`;

      const unwrapped = ShareUrlService.unwrapManifestUrl(shareUrl);
      // URLSearchParams.get() decodes once automatically, so double-encoded becomes single-encoded
      expect(unwrapped).toBe(encodeURIComponent(manifestUrl));
    });
  });

  describe('isShareUrl', () => {
    it('should detect app share URLs', () => {
      const shareUrl = 'https://openstride.org/add-friend?manifest=test';
      expect(ShareUrlService.isShareUrl(shareUrl)).toBe(true);
    });

    it('should detect share URLs from different domains', () => {
      const shareUrl = 'https://example.com/add-friend?manifest=test';
      expect(ShareUrlService.isShareUrl(shareUrl)).toBe(true);
    });

    it('should reject URLs without /add-friend path', () => {
      const notShareUrl = 'https://openstride.org/friends?manifest=test';
      expect(ShareUrlService.isShareUrl(notShareUrl)).toBe(false);
    });

    it('should reject URLs without manifest parameter', () => {
      const notShareUrl = 'https://openstride.org/add-friend';
      expect(ShareUrlService.isShareUrl(notShareUrl)).toBe(false);
    });

    it('should reject direct Google Drive URLs', () => {
      const directUrl = 'https://drive.google.com/uc?id=ABC123';
      expect(ShareUrlService.isShareUrl(directUrl)).toBe(false);
    });

    it('should reject malformed URLs', () => {
      expect(ShareUrlService.isShareUrl('not a url')).toBe(false);
      expect(ShareUrlService.isShareUrl('')).toBe(false);
    });

    it('should handle URLs with additional query parameters', () => {
      const shareUrl = 'https://openstride.org/add-friend?manifest=test&foo=bar';
      expect(ShareUrlService.isShareUrl(shareUrl)).toBe(true);
    });
  });

  describe('isValidManifestUrl', () => {
    it('should accept drive.google.com URLs', () => {
      expect(ShareUrlService.isValidManifestUrl('https://drive.google.com/uc?id=ABC')).toBe(true);
      expect(ShareUrlService.isValidManifestUrl('https://drive.google.com/file/d/123')).toBe(true);
    });

    it('should accept docs.google.com URLs', () => {
      expect(ShareUrlService.isValidManifestUrl('https://docs.google.com/document/123')).toBe(true);
    });

    it('should reject non-Google-Drive URLs', () => {
      expect(ShareUrlService.isValidManifestUrl('https://example.com/manifest.json')).toBe(false);
      expect(ShareUrlService.isValidManifestUrl('https://evil.com/fake-manifest')).toBe(false);
    });

    it('should accept both http and https protocols', () => {
      // Accept both for development (localhost) and production
      expect(ShareUrlService.isValidManifestUrl('https://drive.google.com/uc?id=ABC')).toBe(true);
      expect(ShareUrlService.isValidManifestUrl('http://drive.google.com/uc?id=ABC')).toBe(true);
    });

    it('should reject malformed URLs', () => {
      expect(ShareUrlService.isValidManifestUrl('not a url')).toBe(false);
      expect(ShareUrlService.isValidManifestUrl('')).toBe(false);
    });

    it('should reject URLs from google.com but not drive/docs subdomain', () => {
      expect(ShareUrlService.isValidManifestUrl('https://www.google.com/search')).toBe(false);
      expect(ShareUrlService.isValidManifestUrl('https://mail.google.com')).toBe(false);
    });

    it('should accept localhost URLs in development mode', () => {
      // In test environment (which is dev mode), localhost should be accepted
      expect(ShareUrlService.isValidManifestUrl('http://localhost:3000/test-manifest.json')).toBe(true);
      expect(ShareUrlService.isValidManifestUrl('http://127.0.0.1:3000/test-manifest.json')).toBe(true);
    });
  });

  describe('Integration: wrap and unwrap round-trip', () => {
    beforeEach(() => {
      import.meta.env.VITE_APP_BASE_URL = 'https://openstride.org';
    });

    it('should successfully round-trip a manifest URL', () => {
      const original = 'https://drive.google.com/uc?id=ABC123&export=download';

      const wrapped = ShareUrlService.wrapManifestUrl(original);
      const unwrapped = ShareUrlService.unwrapManifestUrl(wrapped);

      expect(unwrapped).toBe(original);
    });

    it('should handle complex URLs with special characters', () => {
      const original = 'https://drive.google.com/uc?id=ABC&foo=bar&baz=test#anchor';

      const wrapped = ShareUrlService.wrapManifestUrl(original);
      const unwrapped = ShareUrlService.unwrapManifestUrl(wrapped);

      expect(unwrapped).toBe(original);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string manifest URL', () => {
      expect(() => ShareUrlService.wrapManifestUrl('')).not.toThrow();
      const wrapped = ShareUrlService.wrapManifestUrl('');
      expect(wrapped).toContain('/add-friend?manifest=');
    });

    it('should handle URLs with only protocol', () => {
      const url = 'https://';
      const wrapped = ShareUrlService.wrapManifestUrl(url);
      expect(ShareUrlService.unwrapManifestUrl(wrapped)).toBe(url);
    });

    it('should properly validate after wrapping/unwrapping', () => {
      const validManifest = 'https://drive.google.com/uc?id=ABC';
      const wrapped = ShareUrlService.wrapManifestUrl(validManifest);

      expect(ShareUrlService.isShareUrl(wrapped)).toBe(true);

      const unwrapped = ShareUrlService.unwrapManifestUrl(wrapped);
      expect(ShareUrlService.isValidManifestUrl(unwrapped!)).toBe(true);
    });
  });
});
