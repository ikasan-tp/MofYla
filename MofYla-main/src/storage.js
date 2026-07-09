import { LocalStorageAdapter } from './services/localStorageAdapter.js';

class StorageManager {
  constructor(adapter = new LocalStorageAdapter()){
    this.adapter = adapter;
  }
  use(adapter){ this.adapter = adapter; }
  get(key, fallback = null){ return this.adapter.get(key, fallback); }
  set(key, value){ return this.adapter.set(key, value); }
  remove(key){ return this.adapter.remove(key); }
  list(prefix = ''){ return this.adapter.list(prefix); }
}

export const Storage = new StorageManager();

const legacyStorage = {
  async get(key, fallback = null){
    const value = await Storage.get(key, fallback);
    if(value === null || value === undefined || value === false) return value;
    return { value: typeof value === 'string' ? value : JSON.stringify(value) };
  },
  async set(key, value){ return Storage.set(key, value); },
  async remove(key){ return Storage.remove(key); },
  async delete(key){ return Storage.remove(key); },
  async list(prefix = ''){ return Storage.list(prefix); }
};

window.StorageManager = StorageManager;
window.Storage = Storage;
window.storage = legacyStorage;
