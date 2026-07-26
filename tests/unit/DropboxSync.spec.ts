import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- Mocks ----------

const mockReadBackupFile = vi.fn()
const mockWriteBackupFile = vi.fn()

vi.mock('../../plugins/storage-providers/Dropbox/client/DropboxFileService', () => ({
  DropboxFileService: {
    getInstance: vi.fn(() =>
      Promise.resolve({
        readBackupFile: mockReadBackupFile,
        writeBackupFile: mockWriteBackupFile
      })
    )
  }
}))

import { readRemote, writeRemote } from '../../plugins/storage-providers/Dropbox/client/DropboxSync'

// ---------- Tests ----------

describe('DropboxSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('readRemote', () => {
    it('returns array when remote file contains an array', async () => {
      const remoteData = [
        { id: 'a1', title: 'Run 1' },
        { id: 'a2', title: 'Run 2' }
      ]
      mockReadBackupFile.mockResolvedValue(remoteData)

      const result = await readRemote('activities')

      expect(result).toEqual(remoteData)
      expect(mockReadBackupFile).toHaveBeenCalledWith('activities_backup.json')
    })

    it('returns empty array when the file does not exist yet', async () => {
      mockReadBackupFile.mockResolvedValue(null)

      expect(await readRemote('activities')).toEqual([])
    })

    it('handles legacy format: object with activities[] property', async () => {
      const legacyData = { activities: [{ id: 'a1' }, { id: 'a2' }] }
      mockReadBackupFile.mockResolvedValue(legacyData)

      expect(await readRemote('activities')).toEqual(legacyData.activities)
    })

    it('handles legacy format: object dictionary (keyed by ID)', async () => {
      mockReadBackupFile.mockResolvedValue({
        a1: { id: 'a1', title: 'Run 1' },
        a2: { id: 'a2', title: 'Run 2' }
      })

      const result = await readRemote('activities')

      expect(result).toHaveLength(2)
      expect(result).toContainEqual({ id: 'a1', title: 'Run 1' })
    })

    it('returns empty array for unexpected primitive type', async () => {
      mockReadBackupFile.mockResolvedValue('some string')

      expect(await readRemote('activities')).toEqual([])
    })

    it('ignores non-array object without recognizable pattern', async () => {
      mockReadBackupFile.mockResolvedValue({ foo: 'bar', count: 42 })

      expect(await readRemote('activities')).toEqual([])
    })

    it('returns empty array when read throws an error', async () => {
      mockReadBackupFile.mockRejectedValue(new Error('Network error'))

      expect(await readRemote('activities')).toEqual([])
    })

    it('uses the store name to build the backup filename', async () => {
      mockReadBackupFile.mockResolvedValue([])

      await readRemote('activity_details')

      expect(mockReadBackupFile).toHaveBeenCalledWith('activity_details_backup.json')
    })
  })

  describe('writeRemote', () => {
    it('writes the payload under the store backup filename', async () => {
      const data = [{ id: 'a1' }]
      mockWriteBackupFile.mockResolvedValue(undefined)

      await writeRemote('activities', data)

      expect(mockWriteBackupFile).toHaveBeenCalledWith('activities_backup.json', data)
    })

    it('propagates write failures so SyncService can react', async () => {
      mockWriteBackupFile.mockRejectedValue(new Error('Cannot write to Dropbox'))

      await expect(writeRemote('activities', [])).rejects.toThrow('Cannot write to Dropbox')
    })
  })
})
