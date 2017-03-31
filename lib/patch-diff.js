/**
 * Created by barakedry on 6/19/15.
 */
'use strict';
var _ = require('lodash');
var util = require('util');
var utils = require('./utils');
var DiffTracker = require('./diff-tracker');
var EventEmitter = require('events').EventEmitter;
var debug = require('debuglog')('apply-diff');

function PatchDiff(object, options) {
    this.options = _.defaults(options || {}, {
        emitEvents: true, // settings this to false should allow faster merging but it is not implemented yet
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
    //this.prototypes = []; // prototypes are stored in a special collection

    this.setMaxListeners(this.options.maxListeners);
}

util.inherits(PatchDiff, EventEmitter);

PatchDiff.prototype._emitTopLevelEvent = function (event, eventData, options) {
    var levelDiffs = eventData.levelDiffs;

    if (options.emitEvents && levelDiffs && (levelDiffs.hasDeletions || levelDiffs.hasUpdates || levelDiffs.hasDifferences || levelDiffs.hasAdditions)) {
        this.emit(event, eventData); //specific top level event: override, apply, delete, ...
        this.emit('change', eventData); //general top level event
    }
};

PatchDiff.prototype.apply = function (delta, path, options) {

    options = _.defaults(options || {}, this.options);

    if (!_.isObject(delta) && !path) {
        debug('invalid apply, source and delta must be objects');
        return;
    }

    var levelDiffs = this._applyObject(this.object, utils.wrapByPath(delta, path), '', options, 0);

    this._emitTopLevelEvent('patch', {
        path: path || '*',
        object: this.object,
        delta: delta,
        levelDiffs: levelDiffs
    }, options);
};

PatchDiff.prototype.override = function (delta, path, options) {

    options = _.defaults(options || {}, this.options);

    if (!_.isObject(delta) && !path) {
        debug('invalid apply, source and delta must be objects');
        return;
    }

    var levelDiffs = this._applyObject(this.object, utils.wrapByPath(delta, path), '', options, 0, path || '');

    this._emitTopLevelEvent('override', {
        path: path || '*',
        object: this.object,
        delta: delta,
        levelDiffs: levelDiffs
    }, options);
};

PatchDiff.prototype.delete = function (path) {

    if (!(path && _.isString(path))) {
        debug('invalid path, cannot delete');
        return;
    }

    var levelDiffs = this._applyObject(this.object, utils.wrapByPath(this.options.deleteKeyword, path), '', this.options, 0);

    this._emitTopLevelEvent('delete', {
        path: path || '*',
        object: this.object,
        levelDiffs: levelDiffs
    }, this.options);
};

PatchDiff.prototype.get = function (path) {

    if (path && (!_.isString(path))) {
        debug('invalid path, cannot get');
        return;
    }


    if (path) {
        return _.get(this.object, path);
    }

    return this.object;
};


/************************************************************************************
 * The basic merging recursion implementation:
 * ._applyObject() -> ._applyAtKey() -> ._applyObject() -> ._applyAtKey() -> ...
 *
 * ._applyObject() iterate keys at level and calls ._applyAtKey() for each key,
 * after iteration ends it emits and returns level changes to the caller.
 *
 * ._applyAtKey() assigns/delete primitives and calls _.applyObject() for objects
 ************************************************************************************/
PatchDiff.prototype._applyObject = function (source, delta, path, options, level, override) {
    var keys,
        key,
        i,
        length,
        levelDiffs,
        isSourceArray;


    if (!(_.isObject(source) && _.isObject(delta))) {
        debug('invalid apply, source and delta must be objects');
        this.emit('error', new Error('invalid apply, source and delta must be objects'));
        return;
    }

    if (level > options.maxLevels) {
        debug('Trying to apply too deep, stopping at level %d', level);
        this.emit('error', new Error('Trying to apply too deep, stopping at level ' + level));
        return;
    }

    keys = _.keys(delta);
    length = keys.length;
    isSourceArray = _.isArray(source);

    if (options.emitEvents) {
        levelDiffs = DiffTracker.create(isSourceArray && source.length === 0 && _.isArray(delta));
        levelDiffs.path = path;
    }

    if (isSourceArray) {
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
        override = true;
    }

    for (i = 0; i < length; i++) {
        key = keys[i];

        if (utils.isValid(delta[key]) && delta[key] !== source[key]) {
            levelDiffs = this._applyAtKey(source, delta, path, key, levelDiffs, options, isSourceArray, level, override);
        }

    }

    if (override && (typeof override === 'boolean')) {
        // find keys at this level that exists at the source object and delete them
        levelDiffs = this._detectDeletionsAtLevel(source, delta, levelDiffs, path, options, isSourceArray, level);
    }

    if (options.emitEvents) {
        this.emit(options.pathEventPrefix + (path || '*'), levelDiffs);
    }

    return levelDiffs;
};

PatchDiff.prototype._applyAtKey = function (source, delta, path, key, levelDiffs, options, isSourceArray, level, override) {

    var childDiffs,
        mergingValue,
        existingValue,
        srcKey,
        appliedValue, // this value is what goes out to the tracker its not allways the same as mergingValue
        isExistingValueArray,
        isObjectPatching = false;

    mergingValue = delta[key];

    if (isSourceArray) {
        srcKey = Number(key) + levelDiffs.arrayOffset;
    } else {
        srcKey = key;
    }

    if (_.isFunction(mergingValue)) {
        appliedValue = utils.SERIALIZABLE_FUNCTION;
    } else {
        isObjectPatching = _.isObject(mergingValue);
        if (_.isUndefined(mergingValue)) {
            appliedValue = options.undefinedKeyword;
        } else if (mergingValue === options.undefinedKeyword) {
            appliedValue = mergingValue;
            mergingValue = undefined;
        } else {
            appliedValue = mergingValue;
        }
    }

    // new
    if (!source.hasOwnProperty(srcKey)) {
        if (options.patchAdditions && delta[key] !== options.deleteKeyword) {

            // add new object
            if (isObjectPatching) {

                source[srcKey] = mergingValue.constructor.call(Object.create(Object.getPrototypeOf(mergingValue)));

                childDiffs = this._applyObject(source[srcKey],
                                               mergingValue,
                                               utils.concatPath(path, key),
                                               options,
                                               level + 1,
                                               override);

                levelDiffs.addChildTracking(childDiffs, key);

            // add new primitive
            } else {

                source[srcKey] = mergingValue;

                levelDiffs.hasAdditions = true;
                levelDiffs.additions[key] = appliedValue;
                levelDiffs.hasDifferences = true;
                levelDiffs.differences[key] = appliedValue;
            }
        }
    // existing
    } else {

        existingValue = source[srcKey];
        isExistingValueArray = _.isArray(existingValue);

        // delete
        if (delta[key] === options.deleteKeyword) {

            levelDiffs = this._deleteAtKey(source, path, key, srcKey, options, existingValue, isSourceArray, levelDiffs);

        // update
        } else {

            // update object
            if (isObjectPatching) {

                // we should replace the source value, todo: array merges check is not sufficient
                if (!isExistingValueArray && !utils.hasSamePrototype(existingValue, mergingValue)) {

                    // this is a restructure
                    // handle prototypes
                    source[srcKey] = Object.create(this.getPrototypeOf(mergingValue));

                }

                childDiffs = this._applyObject(source[srcKey],
                                               mergingValue,
                                               utils.concatPath(path, key),
                                               options,
                                               level + 1,
                                               override);

                levelDiffs.addChildTracking(childDiffs, key);

            // update primitive
            } else {

                source[srcKey] = mergingValue;

                levelDiffs.hasUpdates = true;
                levelDiffs.updates[key] = {'old': existingValue, 'new': appliedValue};
                levelDiffs.hasDifferences = true;
                levelDiffs.differences[key] = appliedValue;
            }

        }

    }

    return levelDiffs;
};

PatchDiff.prototype._deleteAtKey = function (source, path, key, srcKey, options, existingValue, isSourceArray, levelDiffs) {
    if (options.patchDeletions) {
        if (isSourceArray) {
            source.splice(srcKey, 1);
            levelDiffs.arrayOffset--;
        } else {
            delete source[srcKey];
        }

    }

    levelDiffs.deletions[key] = existingValue;
    levelDiffs.differences[key] = options.deleteKeyword;
    levelDiffs.hasDeletions = true;
    levelDiffs.hasDifferences = true;

    this.emitInnerDeletions(path, existingValue, options);

    return levelDiffs;
};

PatchDiff.prototype._detectDeletionsAtLevel = function (source, delta, levelDiffs, path, options, isSourceArray) {
    var keys = _.keys(source),
        length = keys.length,
        existingValue,
        srcKey,
        key,
        i;

    // run source object at this level
    for (i = 0; i < length; i++) {
        key = keys[i];
        if (isSourceArray) {
            srcKey = Number(key) + levelDiffs.arrayOffset;
        } else {
            srcKey = key;
        }


        if (!delta.hasOwnProperty(key)) {
            existingValue = source[key];

            levelDiffs = this._deleteAtKey(source, path, key, srcKey, options, existingValue,
                isSourceArray, levelDiffs);

        }

    }
    return levelDiffs;
};

PatchDiff.prototype.getPrototypeOf = function (object) {
    return Object.getPrototypeOf(object);
};

PatchDiff.prototype.emitInnerDeletions = function (deletedObject, path, options) {
    var keys, key, i;

    if (!_.isObject(deletedObject)) {
        return;
    }

    keys = _.keys(deletedObject);
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        if (_.isObject(deletedObject[key])) {
            this.emitInnerDeletions(deletedObject[key], utils.concatPath(path, key), options);
        }
    }

    this.deletions.emit(options.pathEventPrefix + path, deletedObject);
    this.difference.emit(options.pathEventPrefix + path, this.options.deleteKeyword);
};

module.exports = PatchDiff;
