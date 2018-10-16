'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

class Store {
    constructor(dbName = 'keyval-store', storeName = 'keyval') {
        this.dbName = dbName;
        this.storeName = storeName;
        this._dbp = new Promise((resolve, reject) => {
            const openreq = indexedDB.open(dbName, 1);
            openreq.onerror = () => reject(openreq.error);
            openreq.onsuccess = () => resolve(openreq.result);
            // First time setup: create an empty object store
            openreq.onupgradeneeded = () => {
                openreq.result.createObjectStore(storeName);
            };
        });
    }
    _withIDBStore(type, callback) {
        return this._dbp.then(db => new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, type);
            transaction.oncomplete = () => resolve();
            transaction.onabort = transaction.onerror = () => reject(transaction.error);
            callback(transaction.objectStore(this.storeName));
        }));
    }
}
let store;
let expireStore;
function getCurrentTime() {
    return Math.round((new Date()).getTime() / 1000);
}
function getDefaultStore() {
    if (!store)
        store = new Store();
    return store;
}
function getExpireStore(dbName) {
    if (!expireStore) {
        expireStore = new Store(dbName, 'keysToExpire');
        // Every 3 minutes, check which key should be removed:
        window.setInterval(function () {
            keys(expireStore).then(keys => {
                let ts = getCurrentTime();
                for (let key of keys) {
                    get(key, expireStore).then(val => {
                        if (val < ts) {
                            del(key, expireStore);
                        }
                    });
                }
            });
        }, 3 * 60 * 1000);
    }
    return store;
}
function get(key, store = getDefaultStore()) {
    let req;
    return store._withIDBStore('readonly', store => {
        req = store.get(key);
    }).then(() => req.result);
}
function set(key, value, expire = 0, store = getDefaultStore()) {
    return store._withIDBStore('readwrite', store => {
        store.put(value, key);
    }).then(function () {
        // If this key should expire:
        if (expire) {
            console.log('setting key to expire');
            // Get expired keys store for this DB:
            console.log(store.dbName);
            store = getExpireStore(store.dbName);
            console.log(store);
            let ts = getCurrentTime();
            store._withIDBStore('readwrite', store => {
                store.put(key, ts + expire);
            });
        }
    });
}
function del(key, store = getDefaultStore()) {
    return store._withIDBStore('readwrite', store => {
        store.delete(key);
    });
}
function clear(store = getDefaultStore()) {
    return store._withIDBStore('readwrite', store => {
        store.clear();
    });
}
function keys(store = getDefaultStore()) {
    const keys = [];
    return store._withIDBStore('readonly', store => {
        // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
        // And openKeyCursor isn't supported by Safari.
        (store.openKeyCursor || store.openCursor).call(store).onsuccess = function () {
            if (!this.result)
                return;
            keys.push(this.result.key);
            this.result.continue();
        };
    }).then(() => keys);
}

exports.Store = Store;
exports.get = get;
exports.set = set;
exports.del = del;
exports.clear = clear;
exports.keys = keys;
