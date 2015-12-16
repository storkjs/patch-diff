/**
 * Created by barakedry on 6/19/15.
 */
'use strict';
var _ = require('lodash');
var util = require('util');
var utils = require('./utils');
var DiffTracker = require('./diff-tracker');
var EventEmitter = require('events').EventEmitter;
var debug = require('debuglog')('merge-diff');

function MergeDiff(object, options) {
    this.options = _.defaults(options || {}, {
        emitEvents: true, // settings this to false should allow faster merging but it is not implemented yet
        undefinedKeyword: '__$$U',
        deleteKeyword: '__$$D',
        protoKeyword: '__$$P',
        mergeDeletions: true,
        mergeAdditions: true,
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

util.inherits(MergeDiff, EventEmitter);

MergeDiff.prototype._emitTopLevelEvent = function (levelDiffs, event, eventData, options) {
    if (options.emitEvents && levelDiffs && (levelDiffs.hasDeletions || levelDiffs.hasUpdates || levelDiffs.hasDifferences || levelDiffs.hasAdditions)) {
        this.emit(event, eventData); //specific top level event: override, merge, delete, ...
        this.emit('change', eventData); //general top level event
    }
};

MergeDiff.prototype.merge = function (delta, path, options) {

    options = _.defaults(options || {}, this.options);

    if (!_.isObject(delta) && !path) {
        debug('invalid merge, source and delta must be objects');
        return;
    }

    var levelDiffs = this._mergeObject(this.object, utils.wrapByPath(delta, path), '', options, 0);

    this._emitTopLevelEvent(levelDiffs, 'merge', {
        path: path || '*',
        object: this.object,
        delta: delta
    }, options);
};

MergeDiff.prototype.override = function (delta, path, options) {

    options = _.defaults(options || {}, this.options);

    if (!_.isObject(delta) && !path) {
        debug('invalid merge, source and delta must be objects');
        return;
    }

    var levelDiffs = this._mergeObject(this.object, utils.wrapByPath(delta, path), '', options, 0, path);

    this._emitTopLevelEvent(levelDiffs, 'override', {
        path: path || '*',
        object: this.object,
        delta: delta
    }, options);
};

MergeDiff.prototype.delete = function (path) {

    if (!(path && _.isString(path))) {
        debug('invalid path, cannot delete');
        return;
    }

    var levelDiffs = this._mergeObject(this.object, utils.wrapByPath(this.options.deleteKeyword, path), '', this.options, 0);

    this._emitTopLevelEvent(levelDiffs, 'delete', {
        path: path || '*',
        object: this.object
    }, this.options);
};

MergeDiff.prototype.get = function (path) {

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
 * ._mergeObject() -> ._mergeAtKey() -> ._mergeObject() -> ._mergeAtKey() -> ...
 *
 * ._mergeObject() iterate keys at level and calls ._mergeAtKey() for each key,
 * after iteration ends it emits and returns level changes to the caller.
 *
 * ._mergeAtKey() assigns/delete primitives and calls _.mergeObject() for objects
 ************************************************************************************/
MergeDiff.prototype._mergeObject = function (source, delta, path, options, level, override) {
    var keys,
        key,
        i,
        length,
        levelDiffs,
        isSourceArray;


    if (!(_.isObject(source) && _.isObject(delta))) {
        debug('invalid merge, source and delta must be objects');
        this.emit('error', new Error('invalid merge, source and delta must be objects'));
        return;
    }

    if (level > options.maxLevels) {
        debug('Trying to merge too deep, stopping at level %d', level);
        this.emit('error', new Error('Trying to merge too deep, stopping at level ' + level));
        return;
    }

    keys = _.keys(delta);
    length = keys.length;
    isSourceArray = _.isArray(source);

    if (options.emitEvents) {
        levelDiffs = DiffTracker.create();
        levelDiffs.path = path;
    }

    if (isSourceArray) {
        levelDiffs = levelDiffs || {};
        levelDiffs.arrayOffset = 0;
    }

    if (length > options.maxKeysInLevel) {
        debug('Stopping Merge, Too many keys in object - %d out of %d allowed keys.', length, options.maxKeysInLevel);
        this.emit('error', new Error('Stopping Merge, Too many keys in object - ' + length + ' out of ' + options.maxKeysInLevel + ' allowed keys.'));
        return levelDiffs;
    }

    // override is either undefined, a path or true
    if (!_.isUndefined(override) && (override === true || override === path)) {
        override = true;
    }

    for (i = 0; i < length; i++) {
        key = keys[i];

        if (utils.isValid(delta[key]) && delta[key] !== source[key]) {
            levelDiffs = this._mergeAtKey(source, delta, path, key, levelDiffs, options, isSourceArray, level, override);
        }

    }

    if (override && (typeof override === 'boolean')) {
        // find keys at this level that exists at the source object and delete them
        levelDiffs = this._detectDeletionsAtLevel(source, delta, levelDiffs, path, options, isSourceArray, level);
    }

    if (options.emitEvents) {
        this.emit(path || '*', levelDiffs);
    }

    return levelDiffs;
};

MergeDiff.prototype._mergeAtKey = function (source, delta, path, key, levelDiffs, options, isSourceArray, level, override) {

    var childDiffs,
        mergingValue,
        existingValue,
        srcKey,
        mergedValue, // this value is what goes out to the tracker its not allways the same as mergingValue
        isExistingValueArray,
        isObjectMerge = false;

    mergingValue = delta[key];

    if (isSourceArray) {
        srcKey = Number(key) + levelDiffs.arrayOffset;
    } else {
        srcKey = key;
    }

    if (_.isFunction(mergingValue)) {
        mergedValue = utils.SERIALIZABLE_FUNCTION;
    } else {
        isObjectMerge = _.isObject(mergingValue);
        if (_.isUndefined(mergingValue)) {
            mergedValue = options.undefinedKeyword;
        } else if (mergingValue === options.undefinedKeyword) {
            mergedValue = mergingValue;
            mergingValue = undefined;
        } else {
            mergedValue = mergingValue;
        }
    }

    // new
    if (!source.hasOwnProperty(srcKey)) {
        if (options.mergeAdditions && delta[key] !== options.deleteKeyword) {

            // add new object
            if (isObjectMerge) {

                if (Array.isArray(mergingValue)) {
                    source[srcKey] = [];
                } else {
                    source[srcKey] = Object.create(this.getPrototypeOf(mergingValue));
                }

                childDiffs = this._mergeObject(source[srcKey],
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
                levelDiffs.additions[key] = mergedValue;
                levelDiffs.hasDifferences = true;
                levelDiffs.differences[key] = mergedValue;
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
            if (isObjectMerge) {

                // we should replace the source value, todo: array merges check is not sufficient
                if (!isExistingValueArray && !utils.hasSamePrototype(existingValue, mergingValue)) {

                    // this is a restructure
                    // handle prototypes
                    source[srcKey] = Object.create(this.getPrototypeOf(mergingValue));

                }

                childDiffs = this._mergeObject(source[srcKey],
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
                levelDiffs.updates[key] = {'old': existingValue, 'new': mergedValue};
                levelDiffs.hasDifferences = true;
                levelDiffs.differences[key] = mergedValue;
            }

        }

    }

    return levelDiffs;
};

MergeDiff.prototype._deleteAtKey = function (source, path, key, srcKey, options, existingValue, isSourceArray, levelDiffs) {
    if (options.mergeDeletions) {
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

    this.emitInnerDeletions(path, existingValue);

    return levelDiffs;
};

MergeDiff.prototype._detectDeletionsAtLevel = function (source, delta, levelDiffs, path, options, isSourceArray) {
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

MergeDiff.prototype.getPrototypeOf = function (object) {
    return Object.getPrototypeOf(object);
};

MergeDiff.prototype.emitInnerDeletions = function (deletedObject, path) {
    var keys, key, i;

    if (!_.isObject(deletedObject)) {
        return;
    }

    keys = _.keys(deletedObject);
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        if (_.isObject(deletedObject[key])) {
            this.emitInnerDeletions(deletedObject[key], utils.concatPath(path, key));
        }
    }

    this.deletions.emit(path, deletedObject);
    this.difference.emit(path, this.options.deleteKeyword);
};

module.exports = MergeDiff;
