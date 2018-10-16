export declare class Store {
    readonly dbName: string;
    readonly storeName: string;
    readonly _dbp: Promise<IDBDatabase>;
    constructor(dbName?: string, storeName?: string, version?: number);
    _withIDBStore(type: IDBTransactionMode, callback: ((store: IDBObjectStore) => void)): Promise<void>;
}
export declare function get<Type>(key: IDBValidKey, store?: Store): Promise<Type>;
export declare function set(key: IDBValidKey, value: any, store?: Store, expire?: number): Promise<void>;
export declare function del(key: IDBValidKey, store?: Store): Promise<void>;
export declare function clear(store?: Store): Promise<void>;
export declare function keys(store?: Store): Promise<IDBValidKey[]>;
