import type { ExtensionPlugin } from '@/types/extension'

/**
 * MCP (Model Context Protocol) Plugin
 *
 * Allows AI assistants (Claude, ChatGPT, etc.) to access and analyze
 * OpenStride training data via the Model Context Protocol.
 *
 * Features:
 * - One-click data publication to Google Drive
 * - Manifest URL for MCP server configuration
 * - Platform-specific setup guides (macOS/Linux/Windows)
 * - Statistics overview
 *
 * Requirements:
 * - Google Drive connection (cloud backup)
 * - Activities marked as public (privacy settings)
 */

export default {
  id: 'mcp',
  label: 'AI Assistant (MCP)',
  description: 'Connect your training data to AI assistants like Claude, ChatGPT, and more using the Model Context Protocol',
  icon: 'fas fa-robot',

  // Add tab to Profile page
  slots: {
    'profile.tabs': [() => import('./ProfileMCP.vue')]
  },

  // Tab metadata for profile navigation
  tabMetadata: {
    tabId: 'mcp',
    tabLabelKey: 'profile.tabs.mcp',
    tabIcon: 'fas fa-robot'
  }
} as ExtensionPlugin
