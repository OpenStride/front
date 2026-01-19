/**
 * PublicFileService - Abstraction layer for public file storage operations
 *
 * This service provides an interface for storing files that need to be publicly
 * accessible (e.g., for friend activity sharing). It dynamically discovers and uses
 * enabled storage plugins that support public file sharing.
 *
 * The service automatically detects which storage plugin (Google Drive, Dropbox, etc.)
 * the user has enabled and uses it for public file operations. This follows the same
 * pattern as StorageService for backup operations.
 */

import { StoragePluginManager } from './StoragePluginManager';
import type { StoragePlugin } from '@/types/storage';

/**
 * PublicFileService - Main service for public file operations
 *
 * Uses singleton pattern and dynamically selects an enabled storage plugin
 * that supports public file sharing (supportsPublicFiles: true)
 */
export class PublicFileService {
  private static instance: PublicFileService;
  private pluginManager: StoragePluginManager;
  private cachedPlugin: StoragePlugin | null = null;

  private constructor() {
    this.pluginManager = StoragePluginManager.getInstance();
  }

  public static getInstance(): PublicFileService {
    if (!PublicFileService.instance) {
      PublicFileService.instance = new PublicFileService();
    }
    return PublicFileService.instance;
  }

  /**
   * Get the first enabled storage plugin that supports public files
   * Returns null if no plugin supports public files
   * Caches the result for synchronous access
   */
  private async getPublicFilePlugin(): Promise<StoragePlugin | null> {
    // Return cached plugin if available
    if (this.cachedPlugin) {
      return this.cachedPlugin;
    }

    const enabledPlugins = await this.pluginManager.getMyStoragePlugins();

    // Find first plugin that supports public files
    const plugin = enabledPlugins.find(p => p.supportsPublicFiles === true);

    if (!plugin) {
      console.warn('[PublicFileService] No enabled storage plugin supports public files');
      return null;
    }

    // Cache the plugin
    this.cachedPlugin = plugin;
    return plugin;
  }

  /**
   * Write a file to public storage
   * Returns the public URL for accessing the file
   */
  public async writePublicFile(filename: string, content: any): Promise<string | null> {
    const plugin = await this.getPublicFilePlugin();
    if (!plugin?.writePublicFile) {
      console.error('[PublicFileService] No plugin available for writePublicFile');
      return null;
    }

    return await plugin.writePublicFile(filename, content);
  }

  /**
   * Delete a file from public storage by its ID
   */
  public async deleteFile(fileId: string): Promise<boolean> {
    const plugin = await this.getPublicFilePlugin();
    if (!plugin?.deleteFile) {
      console.error('[PublicFileService] No plugin available for deleteFile');
      return false;
    }

    return await plugin.deleteFile(fileId);
  }

  /**
   * Get the public URL for an existing file
   */
  public async getPublicFileUrl(filename: string): Promise<string | null> {
    const plugin = await this.getPublicFilePlugin();
    if (!plugin?.getPublicFileUrl) {
      console.error('[PublicFileService] No plugin available for getPublicFileUrl');
      return null;
    }

    return await plugin.getPublicFileUrl(filename);
  }

  /**
   * Extract file ID from a public URL
   * Delegates to the plugin's URL parser if available
   */
  public extractFileIdFromUrl(url: string): string | null {
    // Try to use cached plugin's parser
    if (this.cachedPlugin?.extractFileIdFromUrl) {
      return this.cachedPlugin.extractFileIdFromUrl(url);
    }

    // Fallback: Generic parser that works with Google Drive format
    // https://drive.google.com/uc?id={fileId}&export=download
    const match = url.match(/[?&]id=([^&]+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if any enabled plugin supports public file sharing
   */
  public async hasPublicFileSupport(): Promise<boolean> {
    const plugin = await this.getPublicFilePlugin();
    return plugin !== null;
  }
}
