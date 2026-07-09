export class StorageAdapter {
  async get(key, fallback = null){ throw new Error('StorageAdapter.get is not implemented'); }
  async set(key, value){ throw new Error('StorageAdapter.set is not implemented'); }
  async remove(key){ throw new Error('StorageAdapter.remove is not implemented'); }
  async list(prefix = ''){ throw new Error('StorageAdapter.list is not implemented'); }
}
