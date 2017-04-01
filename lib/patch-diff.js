/**
 * Created by barakedry on 6/19/15.
 */
'use strict';

const _ = require('lodash');
const utils = require('./utils');
const DiffTracker = require('./diff-tracker');
const EventEmitter = require('events').EventEmitter;
const debug = require('debuglog')('apply-diff');

class PatchDiff extends EventEmitter {
    constructor(object, options) {

        super();

        this.options = _.defaults(options || {}, {
            emitEvents: true, //settings this to false should allow faster merging but it is not implemented yet
            pathEventPrefix: 'PATH:',
            undefinedKeyword: '__$$U',
            deleteKeyword: '__$$D',
            protoKeyword: '__$$P',
            patchDeletions: true,
            patchAdditions: true,
            emitAdditions: true,
            emitUpdates: true,
            emitDifferences: true,
            maxKeysInLevel: 1000,
            maxLevels: 50,
            maxListeners: 1000000
        });

        this.object = object || {};
        this.setMaxListeners(this.options.maxListeners);
        //this.prototypes = []; // prototypes are stored in a special collection
    }

    _emitTopLevelEvent(event, eventData, options) {
        let levelDiffs = eventData.levelDiffs;

        if (options.emitEvents && levelDiffs && (levelDiffs.hasDeletions || levelDiffs.hasUpdates || levelDiffs.hasDifferences || levelDiffs.hasAdditions)) {
            this.emit(event, eventData); //specific top level event: override, apply, delete, ...
            this.emit('change', eventData); //general top level event
        }
    }

    apply(delta, path, options) {

        options = _.defaults(options || {}, this.options);

        if (!_.isObject(delta) && !path) {
            debug('invalid apply, target and delta must be objects');

            return;
        }

        let levelDiffs = this._applyObject(this.object, utils.wrapByPath(delta, path), '', options, 0);

        this._emitTopLevelEvent('patch', {
            path: path || '*',
            object: this.object,
            delta: delta,
            levelDiffs: levelDiffs
        }, options);
    }

    override(delta, path, options) {

        options = _.defaults(options || {}, this.options);

        if (!_.isObject(delta) && !path) {
            debug('invalid apply, target and delta must be objects');

            return;
        }

        let levelDiffs = this._applyObject(this.object, utils.wrapByPath(delta, path), '', options, 0, path || '');

        this._emitTopLevelEvent('override', {
            path: path || '*',
            object: this.object,
            delta: delta,
            levelDiffs: levelDiffs
        }, options);
    }

    delete(path) {

        if (!(path && _.isString(path))) {
            debug('invalid path, cannot delete');

            return;
        }

        let levelDiffs = this._applyObject(this.object, utils.wrapByPath(this.options.deleteKeyword, path), '', this.options, 0);

        this._emitTopLevelEvent('delete', {
            path: path || '*',
            object: this.object,
            levelDiffs: levelDiffs
        }, this.options);
    }

    get(path) {

        if (path && (!_.isString(path))) {
            debug('invalid path, cannot get');

            return;
        }


        if (path) {
            return _.get(this.object, path);
        }

        return this.object;
    }


    /************************************************************************************
     * The basic merging recursion implementation:
     * ._applyObject() -> ._applyAtKey() -> ._applyObject() -> ._applyAtKey() -> ...
     *
     * ._applyObject() iterate keys at level and calls ._applyAtKey() for each key,
     * after iteration ends it emits and returns level changes to the caller.
     *
     * ._applyAtKey() assigns/delete primitives and calls _.applyObject() for objects
     ************************************************************************************/
    _applyObject(target, delta, path, options, level, override) {

        if (!(_.isObject(target) && _.isObject(delta))) {
            debug('invalid apply, target and delta must be objects');
            this.emit('error', new Error('invalid apply, target and delta must be objects'));

            return;
        }

        if (level > options.maxLevels) {
            debug('Trying to apply too deep, stopping at level %d', level);
            this.emit('error', new Error('Trying to apply too deep, stopping at level ' + level));

            return;
        }

        let levelDiffs;
        let keys = _.keys(delta);
        let length = keys.length;
        let isTargetArray = _.isArray(target);

        if (options.emitEvents) {
            levelDiffs = DiffTracker.create(isTargetArray && target.length === 0 && _.isArray(delta));
            levelDiffs.path = path;
        }

        if (isTargetArray) {
            levelDiffs = levelDiffs || {};
            levelDiffs.arrayOffset = 0;
        }

        if (length > options.maxKeysInLevel) {
            debug('Stopped patching, Too many keys in object - %d out of %d allowed keys.', length, options.maxKeysInLevel);
            this.emit('error', new Error('Stopped patching, Too many keys in object - ' + length + ' out of ' + options.maxKeysInLevel + ' allowed keys.'));

            return levelDiffs;
        }

        // override is either undefined, a path or true
        if ((options.overrides && options.overrides[path]) || (!_.isUndefined(override) && (override === true || override === path))) {
            // find keys at this level that exists at the target object and delete them
            levelDiffs = this._detectDeletionsAtLevel(target, delta, levelDiffs, path, options, isTargetArray, level);
        }

        // main logic loop, iterate patch keys and apply to dest object
        for (let i = 0; i < length; i++) {
            let key = keys[i];

            if (utils.isValid(delta[key]) && delta[key] !== target[key]) {
                levelDiffs = this._applyAtKey(target, delta, path, key, levelDiffs, options, isTargetArray, level, override);
            }
        }

        if (options.emitEvents) {
            this.emit(options.pathEventPrefix + (path || '*'), levelDiffs);
        }

        return levelDiffs;
    }

    _applyAtKey(target, delta, path, key, levelDiffs, options, isTargetArray, level, override) {

        let childDiffs,
            patchValue,
            existingValue,
            srcKey,
            appliedValue, // this value is what goes out to the tracker its not always the same as patchValue
            isExistingValueArray,
            isPatchValueObject = false;

        patchValue = delta[key];

        if (isTargetArray) {
            srcKey = Number(key) + levelDiffs.arrayOffset;
        } else {
            srcKey = key;
        }

        if (_.isFunction(patchValue)) {
            appliedValue = utils.SERIALIZABLE_FUNCTION;
        } else {
            isPatchValueObject = _.isObject(patchValue);
            if (_.isUndefined(patchValue)) {
                appliedValue = options.undefinedKeyword;
            } else if (patchValue === options.undefinedKeyword) {
                appliedValue = patchValue;
                patchValue = undefined;
            } else {
                appliedValue = patchValue;
            }
        }

        // new
        if (!target.hasOwnProperty(srcKey)) {
            if (options.patchAdditions && delta[key] !== options.deleteKeyword) {

                // add new object
                if (isPatchValueObject) {

                    target[srcKey] = patchValue.constructor.call(Object.create(Object.getPrototypeOf(patchValue)));

                    childDiffs = this._applyObject(target[srcKey],
                        patchValue,
                        utils.concatPath(path, key),
                        options,
                        level + 1,
                        override);

                    levelDiffs.addChildTracking(childDiffs, key);

                    // add new primitive
                } else {

                    target[srcKey] = patchValue;

                    levelDiffs.hasAdditions = true;
                    levelDiffs.additions[key] = appliedValue;
                    levelDiffs.hasDifferences = true;
                    levelDiffs.differences[key] = appliedValue;
                }
            }
        // existing
        } else {

            existingValue = target[srcKey];
            isExistingValueArray = _.isArray(existingValue);

            // delete
            if (delta[key] === options.deleteKeyword) {

                levelDiffs = this._deleteAtKey(target, path, key, srcKey, options, existingValue, isTargetArray, levelDiffs);

            // update object
            } else if (isPatchValueObject) {

                // we should replace the target value, todo: array merges check is not sufficient
                if (!isExistingValueArray && !utils.hasSamePrototype(existingValue, patchValue)) {

                    // this is a restructure
                    // handle prototypes
                    target[srcKey] = Object.create(this.getPrototypeOf(patchValue));

                }

                childDiffs = this._applyObject(target[srcKey],
                    patchValue,
                    utils.concatPath(path, key),
                    options,
                    level + 1,
                    override);

                levelDiffs.addChildTracking(childDiffs, key);

            // update primitive
            } else {

                target[srcKey] = patchValue;

                levelDiffs.hasUpdates = true;
                levelDiffs.updates[key] = {'old': existingValue, 'new': appliedValue};
                levelDiffs.hasDifferences = true;
                levelDiffs.differences[key] = appliedValue;
            }

        }

        return levelDiffs;
    }

    _deleteAtKey(target, path, key, srcKey, options, existingValue, isTargetArray, levelDiffs) {
        if (options.patchDeletions) {
            if (isTargetArray) {
                target.splice(srcKey, 1);
                levelDiffs.arrayOffset--;
            } else {
                delete target[srcKey];
            }

        }

        levelDiffs.deletions[key] = existingValue;
        levelDiffs.differences[key] = options.deleteKeyword;
        levelDiffs.hasDeletions = true;
        levelDiffs.hasDifferences = true;

        this.emitInnerDeletions(path, existingValue, options);

        return levelDiffs;
    }

    _detectDeletionsAtLevel(target, delta, levelDiffs, path, options, isTargetArray) {
        let keys = _.keys(target),
            length = keys.length,
            existingValue,
            srcKey,
            key,
            i;

        // run target object at this level
        for (i = 0; i < length; i++) {
            key = keys[i];
            if (isTargetArray) {
                srcKey = Number(key) + levelDiffs.arrayOffset;
            } else {
                srcKey = key;
            }


            if (!delta.hasOwnProperty(key)) {
                existingValue = target[key];

                levelDiffs = this._deleteAtKey(target, path, key, srcKey, options, existingValue,
                    isTargetArray, levelDiffs);

            }

        }

        return levelDiffs;
    }

    getPrototypeOf(object) {
        return Object.getPrototypeOf(object);
    }

    emitInnerDeletions(deletedObject, path, options) {
        let levelDiffs,
            childDiffs;

        if (!_.isObject(deletedObject)) {
            return;
        }

        if (options.emitEvents) {
            levelDiffs = DiffTracker.create();
            levelDiffs.path = path;
        }

        let keys = _.keys(deletedObject);
        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];
            if (_.isObject(deletedObject[key])) {
                childDiffs = this.emitInnerDeletions(deletedObject[key], utils.concatPath(path, key), options);
                levelDiffs.addChildTracking(childDiffs, key);
            }

        }

        levelDiffs.hasDeletions = true;
        levelDiffs.deletions = deletedObject;
        this.emit(options.pathEventPrefix + (path || '*'), levelDiffs);

        return levelDiffs;
    }
}

module.exports = PatchDiff;
