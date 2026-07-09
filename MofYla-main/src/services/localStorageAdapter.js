import { StorageAdapter } from './storageAdapter.js';

export class LocalStorageAdapter extends StorageAdapter {
  constructor(namespace = 'mofyla:v2:'){
    super();
    this.namespace = namespace;
  }
  key(key){ return `${this.namespace}${key}`; }
  async get(key, fallback = null){
    const raw = localStorage.getItem(this.key(key));
    if(raw === null) return fallback;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  async set(key, value){
    localStorage.setItem(this.key(key), JSON.stringify(value));
    return value;
  }
  async remove(key){
    localStorage.removeItem(this.key(key));
  }
  async list(prefix = ''){
    const keys = [];
    const fullPrefix = this.key(prefix);
    for(let i = 0; i < localStorage.length; i += 1){
      const key = localStorage.key(i);
      if(key && key.startsWith(fullPrefix)) keys.push(key.slice(this.namespace.length));
    }
    keys.sort();
    const values = await Promise.all(keys.map(async key => ({ key, value: await this.get(key) })));
    return { keys, values };
  }
}
