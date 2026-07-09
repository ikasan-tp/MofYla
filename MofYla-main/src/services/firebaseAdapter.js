import { StorageAdapter } from './storageAdapter.js';

export class FirebaseAdapter extends StorageAdapter {
  constructor(){
    super();
    this.ready = false;
  }
  fail(){ throw new Error('FirebaseAdapter is a future adapter. Configure Firebase before use.'); }
  async get(){ this.fail(); }
  async set(){ this.fail(); }
  async remove(){ this.fail(); }
  async list(){ this.fail(); }
}
