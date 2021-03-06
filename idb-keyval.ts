export class Store {
  readonly _dbp: Promise<IDBDatabase>;

  constructor(readonly dbName = 'keyval-store', readonly storeName = 'keyval', version = 1) {
    this._dbp = new Promise((resolve, reject) => {
      const openreq = indexedDB.open(dbName, version);
      openreq.onerror = () => reject(openreq.error);
      openreq.onsuccess = () => resolve(openreq.result);

      // First time setup: create an empty object store
      openreq.onupgradeneeded = () => {
        if (!openreq.result.objectStoreNames.contains('keysToExpire'))
          openreq.result.createObjectStore('keysToExpire');

        openreq.result.createObjectStore(storeName);
      };
    });
  }

  _withIDBStore(type: IDBTransactionMode, callback: ((store: IDBObjectStore) => void)): Promise<void> {
    return this._dbp.then(db => new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, type);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
      callback(transaction.objectStore(this.storeName));
    }));
  }
}

let store: Store;
let expireStore: Store;

interface ExpireStoreItem {
  timestamp: number,
  validUntil: number,
  store: string,
  key: IDBValidKey
}

function getCurrentTime(): number {
  return Math.round((new Date()).getTime() / 1000);
}

function getStore(dbName: string, storeName: string) {
  return new Store(dbName, storeName);
}

function getDefaultStore() {
  if (!store) store = new Store();
  return store;
}

function getExpireStore(dbName: string) {
  if (!expireStore) {
    expireStore = new Store(dbName, 'keysToExpire');

    // Every 60 seconds, check which key should be removed:
    window.setInterval(function () {
      keys(expireStore).then(keys => {
        let ts = getCurrentTime();

        for (let key of keys) {
          get(key, expireStore).then(val => {
            let fixedVal: any = val;
            if (fixedVal && (!fixedVal.validUntil || fixedVal.validUntil < ts)) {
              del(fixedVal.key, getStore(dbName, fixedVal.store))
              del(key, expireStore)
            }
          })
        }
      });
    }, 60 * 1000);
  }
  return expireStore;
}

export function get<Type>(key: IDBValidKey, store = getDefaultStore()): Promise<Type> {
  let req: IDBRequest;
  let storeName = store.storeName;

  if (storeName != 'keysToExpire') {
    if (!expireStore) {
      expireStore = getExpireStore(store.dbName);
    }

    // console.log('Checking if key is expired: '+ key)

    let deletedPromise: Promise<void>  | null = null;
    let deletedPromise2: Promise<void> | null = null;
    
    // Check if this key exists in keysToExpire:
    let expiredCheck = get(storeName + '_' + key, expireStore).then(val => {
      let ts = getCurrentTime();
      let fixedVal: any = val;

      // Key is expired, remove it:
      if (fixedVal && (!fixedVal.validUntil || fixedVal.validUntil < ts)) {
        // console.log('Deleting expired key (' + fixedVal.validUntil+' < '+ts+'): ' + key)

        deletedPromise  = del(key, store);
        deletedPromise2 = del(storeName + '_' + key, expireStore);
      }
    });

    return new Promise(function(resolve, reject) {
      expiredCheck.then(() => {
        if (deletedPromise && deletedPromise2) {
          // console.log('Waiting for delete promises to complete for key: ' + key)

          Promise.all([deletedPromise, deletedPromise2]).then(val => {
            resolve(undefined)
          });
        }
        else {
          // console.log('Key was not expired. Returning real value for key: ' + key)

          let p = store._withIDBStore('readonly', store => {
            req = store.get(key);
          }).then(() => req.result);

          p.then(val => {
            resolve(val)
          });
        }
      });
    });
  }
  else {
    return store._withIDBStore('readonly', store => {
      req = store.get(key);
    }).then(() => req.result);
  }
}

export function set(key: IDBValidKey, value: any, store = getDefaultStore(), expire = 0): Promise<void> {
  return store._withIDBStore('readwrite', store => {
    store.put(value, key);
  }).then(function(){
    // If this key should expire:
    if (expire) {
      // Get expired keys store for this DB:
      let expStore = getExpireStore(store.dbName);

      let expireItem: ExpireStoreItem = {
        timestamp: getCurrentTime(),
        validUntil: getCurrentTime() + expire,
        store: store.storeName,
        key: key
      }

      key = store.storeName +'_'+ key;

      expStore._withIDBStore('readwrite', store => {
        store.put(expireItem, key);
      });
    }
  });
}

export function del(key: IDBValidKey, store = getDefaultStore()): Promise<void> {
  return store._withIDBStore('readwrite', store => {
    store.delete(key);
  });
}

export function clear(store = getDefaultStore()): Promise<void> {
  return store._withIDBStore('readwrite', store => {
    store.clear();
  });
}

export function keys(store = getDefaultStore()): Promise<IDBValidKey[]> {
  const keys: IDBValidKey[] = [];

  return store._withIDBStore('readonly', store => {
    // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
    // And openKeyCursor isn't supported by Safari.
    (store.openKeyCursor || store.openCursor).call(store).onsuccess = function() {
      if (!this.result) return;
      keys.push(this.result.key);
      this.result.continue()
    };
  }).then(() => keys);
}
