/**
 * Created by barakedry on 31/03/2017.
 */
'use strict';

const _ = require('lodash');

const PatcherProxy = {
    proxyProperties: new WeakMap(), // meta tracking properties for the proxies
    create(patcher, path, root) {
        let changes = {};
        let patcherRef = patcher.get(path);

        if (!patcherRef || typeof patcherRef !== 'object') {
            throw new Error('no object at path', path);
        }

        let proxy = new Proxy(patcherRef, {
            get: (target, name) => {  return this.handleGet(proxy, target, name); },
            set: (target, name, newval) => {  return this.handleSet(proxy, target, name, newval); },
            has: (target, name) => {  return !!this.handleSet(proxy, target, name); },
            deleteProperty: (target, name) => {  return this.handleDelete(proxy, target, name); }
        });

        this.proxyProperties.set(proxy, {
            root,
            patcher,
            path,
            changes,
            childs: {},
            overrides: {},
            pullChanges() {
                let changes = this.changes;
                let overrides = this.overrides;
                this.changes = {};
                this.overrides = {};
                return [changes, overrides];
            }
        });

        return proxy;
    },

    getPath(proxy, key) {
        let properties = this.proxyProperties.get(proxy);
        return (properties.path ? [properties.path, key] : [key]).join('.');
    },

    at(proxy, path) {
        let properties = this.proxyProperties.get(proxy);

        if (properties.childs[path]) {
            return properties.childs[path];
        }


        let childProxy = this.create(properties.patcher, this.getPath(proxy, path), properties.root || proxy);
        if (path.indexOf('.') === -1) {
            properties.childs[path] = childProxy;
        }

        return childProxy;
    },

    handleGet(proxy, target, name) {
        let properties = this.proxyProperties.get(proxy);
        if (properties.changes[name]) {
            return properties.changes[name];
        }

        if (properties.childs[name]) {
            return properties.childs[name];
        }

        let patcherValue = target[name];
        if (patcherValue) {
            if (typeof  patcherValue === 'object') {
                return this.at(proxy, name);
            } else {
                return patcherValue;
            }
        }

        return undefined;
    },

    handleSet(proxy, target, name, newval) {
        let properties = this.proxyProperties.get(proxy);
        let root = properties.root || proxy;
        let fullPath = this.getPath(proxy, name);
        if (typeof newval === 'object' && typeof target[name] === 'object') {
            this.proxyProperties.get(root).overrides[fullPath] = true;
        }

        if (properties.childs[name]) {
            this.proxyProperties.delete(properties.childs[name]);
            delete properties.childs[name];
        }

        _.set(this.proxyProperties.get(root).changes, fullPath, newval);
        this.patchChanges(root);
        return true;
    },

    handleDelete(proxy, target, name) {
        let properties = this.proxyProperties.get(proxy);
        let root = properties.root || proxy;
        let fullPath = this.getPath(proxy, name);
        let rootChangeTracker = this.proxyProperties.get(root).changes;

        if (target[name]) {
            _.set(rootChangeTracker, fullPath, properties.patcher.options.deleteKeyword);
        } else {
            _.unset(rootChangeTracker, fullPath);
        }

        if (properties.childs[name]) {
            this.proxyProperties.delete(properties.childs[name]);
            delete properties.childs[name];
        }

        this.patchChanges(root);
        return true;
    },

    handleSplice() {

    },

    patchChanges(proxy) {
        this.defer(proxy, () => {
            let properties = this.proxyProperties.get(proxy);
            let patcher = properties.patcher;
            let [patch, overrides] = properties.pullChanges();
            patcher.merge(patch, null, {overrides});
        });
    },

    defer(proxy, cb) {
        let properties = this.proxyProperties.get(proxy);
        if (properties.nextChangeTimeout) {
            clearTimeout(properties.nextChangeTimeout);
            properties.nextChangeTimeout = 0;
        }

        properties.nextChangeTimeout = setTimeout(cb, 0);
    },
};

module.exports = PatcherProxy;