import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- Mocks ----------

const mockEnsureBackupFile = vi.fn()
const mockReadBackupFileContent = vi.fn()
const mockWriteBackupFileByFileId = vi.fn()

vi.mock('../../plugins/storage-providers/GDrive/client/GoogleDriveFileService', () => ({
  GoogleDriveFileService: {
    getInstance: vi.fn(() =>
      Promise.resolve({
        ensureBackupFile: mockEnsureBackupFile,
        readBackupFileContent: mockReadBackupFileContent,
        writeBackupFileByFileId: mockWriteBackupFileByFileId
      })
    )
  }
}))

import { readRemote, writeRemote } from '../../plugins/storage-providers/GDrive/client/GoogleDriveSync'

// ---------- Tests ----------

describe('GoogleDriveSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================
  // readRemote
  // ============================
  describe('readRemote', () => {
    it('returns array when remote file contains an array', async () => {
      const remoteData = [
        { id: 'a1', title: 'Run 1' },
        { id: 'a2', title: 'Run 2' }
      ]
      mockEnsureBackupFile.mockResolvedValue('file-123')
      mockReadBackupFileContent.mockResolvedValue(remoteData)

      const result = await readRemote('activities')

      expect(result).toEqual(remoteData)
      expect(mockEnsureBackupFile).toHaveBeenCalledWith('activities_backup.json')
    })

    it('returns empty array when no file found on Drive', async () => {
      mockEnsureBackupFile.mockResolvedValue(null)

      const result = await readRemote('activities')

      expect(result).toEqual([])
      expect(mockReadBackupFileContent).not.toHaveBeenCalled()
    })

    it('handles legacy format: object with activities[] property', async () => {
      const legacyData = {
        activities: [
          { id: 'a1', title: 'Run 1' },
          { id: 'a2', title: 'Run 2' }
        ]
      }
      mockEnsureBackupFile.mockResolvedValue('file-123')
      mockReadBackupFileContent.mockResolvedValue(legacyData)

      const result = await readRemote('activities')

      expect(result).toEqual(legacyData.activities)
    })

    it('handles legacy format: object dictionary (keyed by ID)', async () => {
      const dictData = {
        a1: { id: 'a1', title: 'Run 1' },
        a2: { id: 'a2', title: 'Run 2' }
      }
      mockEnsureBackupFile.mockResolvedValue('file-123')
      mockReadBackupFileContent.mockResolvedValue(dictData)

      const result = await readRemote('activities')

      expect(result).toHaveLength(2)
      expect(result).toContainEqual({ id: 'a1', title: 'Run 1' })
      expect(result).toContainEqual({ id: 'a2', title: 'Run 2' })
    })

    it('returns empty array for unexpected primitive type', async () => {
      mockEnsureBackupFile.mockResolvedValue('file-123')
      mockReadBackupFileContent.mockResolvedValue('some string')

      const result = await readRemote('activities')

      expect(result).toEqual([])
    })

    it('returns empty array for null content', async () => {
      mockEnsureBackupFile.mockResolvedValue('file-123')
      mockReadBackupFileContent.mockResolvedValue(null)

      const result = await readRemote('activities')

      expect(result).toEqual([])
    })

    it('returns empty array when read throws an error', async () => {
      mockEnsureBackupFile.mockResolvedValue('file-123')
      mockReadBackupFileContent.mockRejectedValue(new Error('Network error'))

      const result = await readRemote('activities')

      expect(result).toEqual([])
    })

    it('ignores non-array object without recognizable pattern', async () => {
      const weirdObject = { foo: 'bar', count: 42 } // values not all objects
      mockEnsureBackupFile.mockResolvedValue('file-123')
      mockReadBackupFileContent.mockResolvedValue(weirdObject)

      const result = await readRemote('activities')

      // 'bar' is not an object, 42 is not an object → not every value is object
      expect(result).toEqual([])
    })
  })

  // ============================
  // writeRemote
  // ============================
  describe('writeRemote', () => {
    it('writes data to the correct backup file', async () => {
      mockEnsureBackupFile.mockResolvedValue('file-456')
      mockWriteBackupFileByFileId.mockResolvedValue(undefined)

      const data = [{ id: 'a1', title: 'Run' }]
      await writeRemote('activities', data)

      expect(mockEnsureBackupFile).toHaveBeenCalledWith('activities_backup.json')
      expect(mockWriteBackupFileByFileId).toHaveBeenCalledWith('file-456', data)
    })

    it('throws when ensureBackupFile returns null', async () => {
      mockEnsureBackupFile.mockResolvedValue(null)

      await expect(writeRemote('activities', [])).rejects.toThrow(
        'Cannot ensure file on Drive'
      )
    })

    it('propagates write errors', async () => {
      mockEnsureBackupFile.mockResolvedValue('file-456')
      mockWriteBackupFileByFileId.mockRejectedValue(new Error('Write failed'))

      await expect(writeRemote('activities', [{ id: 'a1' }])).rejects.toThrow(
        'Write failed'
      )
    })

    it('writes to different stores correctly', async () => {
      mockEnsureBackupFile.mockResolvedValue('file-789')
      mockWriteBackupFileByFileId.mockResolvedValue(undefined)

      await writeRemote('activity_details', [{ id: 'd1' }])

      expect(mockEnsureBackupFile).toHaveBeenCalledWith('activity_details_backup.json')
    })
  })
})
