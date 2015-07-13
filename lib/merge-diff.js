/**
 * Created by barakedry on 6/19/15.
 */
'use strict';
var _ = require('lodash');
var utils = require('./utils');
var DiffTracker = require('./diff-tracker');
var EventEmitter = require('events').EventEmitter;

function MergeDiff(object, options) {
    this.options = _.defaults(options || {}, {
        emitEvents: true,
        deleteKeyword: '__[DELETE]__',
        protoKeyword: '__[proto]__',
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
    this.prototypes = []; // prototypes are stored in a special collection

    //Event emitters
    this.additions = new EventEmitter();
    this.additions.setMaxListeners(this.options.maxListeners);
    this.updates = new EventEmitter();
    this.updates.setMaxListeners(this.options.maxListeners);
    this.differences = new EventEmitter();
    this.differences.setMaxListeners(this.options.maxListeners);
    this.deletions = new EventEmitter();
    this.deletions.setMaxListeners(this.options.maxListeners);
    this.restructure = new EventEmitter();
    this.restructure.setMaxListeners(this.options.maxListeners);
}

MergeDiff.prototype.merge = function (delta, path, options) {

    options = _.defaults(options || {}, this.options);

    if (!_.isObject(delta) && !path) {
        console.error('invalid merge, source and delta must be objects');
        return;
    }

    this._mergeObject(this.object, utils.wrapByPath(delta, path), "", options, 0);
};

MergeDiff.prototype.override = function (delta, path, options) {

    options = _.defaults(options || {}, this.options);

    if (!_.isObject(delta) && !path) {
        console.error('invalid merge, source and delta must be objects');
        return;
    }

    this._mergeObject(this.object, utils.wrapByPath(delta, path), "", options, 0, path);
};

MergeDiff.prototype.delete = function (path) {

    if (!(path && _.isString(path))) {
        console.error('invalid path, cannot delete');
        return;
    }

    this._mergeObject(this.object, utils.wrapByPath(this.options.deleteKeyword, path), "", null, this.options, 0);
};

MergeDiff.prototype.get = function (path) {

    if (!(path && _.isString(path))) {
        console.error('invalid path, cannot delete');
        return;
    }

    return _.get(this.object, path);
};

MergeDiff.prototype._mergeObject = function (source, delta, path, options, level, override) {
    var keys,
        key,
        i,
        length,
        levelDiffs,
        isSourceArray;


    if (!(_.isObject(source) && _.isObject(delta))) {
        console.error('invalid merge, source and delta must be objects');
        return;
    }

    if (level > options.maxLevels) {
        console.error('Trying to merge too deep, stopping at level %d', level);
        // todo: emit error
        return;
    }

    keys = _.keys(delta);
    length = keys.length;
    isSourceArray = _.isArray(source);

    if (options.emitEvents) {
        levelDiffs = DiffTracker.create();
        if (isSourceArray) {
            levelDiffs.arrayOffset = 0;
        }
    }

    if (length > options.maxKeysInLevel) {
        console.error('Too many keys in objects - %d out of %d allowed keys.', level, options.maxKeysInLevel);
        // todo: emit error
        return levelDiffs;
    }

    // override is either undefined, a path or true
    if (override !== 'undefined' && (override === true || override === path)) {
        override = true;
    }

    for (i = 0; i < length; i++) {
        key = keys[i];

        if (utils.isValid(delta[key]) && delta[key] !== source[key]) {
            levelDiffs = this._mergeAtKey(source, delta, path, key, levelDiffs, options, isSourceArray, override);
        }

    }

    if (override) {
        // find keys at this level that does not exists at the source object and delete them
        levelDiffs = this._detectDeletionsAtLevel(source, key, delta, levelDiffs, path, options, isSourceArray);
    }

    this.emitForPath(path || "*", levelDiffs);

    return levelDiffs;
};

MergeDiff.prototype._mergeAtKey = function (source, delta, path, key, levelDiffs, options, isSourceArray, override) {

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
        mergedValue = mergingValue;
    }

    // new
    if (source[srcKey] === undefined) {
        if (options.mergeAdditions && delta[key] !== options.deleteKeyword) {

            // add new object
            if (isObjectMerge) {

                source[srcKey] = Object.create(this.getPrototypeOf(mergingValue));
                childDiffs = this._mergeObject(source[srcKey], mergingValue, utils.concatPath(path, key), options, _.isArray(source[srcKey]), override);
                levelDiffs.addChildTracking(childDiffs, key);

            // add new primitive
            } else {

                source[srcKey] = mergingValue;

                levelDiffs.hasAdditions = true;
                levelDiffs.additions[key] = mergingValue;
                levelDiffs.hasDifferences = true;
                levelDiffs.differences[key] = mergingValue;
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

                // we should replace the source value
                if (!isExistingValueArray && !utils.hasSamePrototype(existingValue, mergingValue)) {

                    // handle prototypes
                    source[srcKey] = Object.create(this.getPrototypeOf(mergingValue));

                }

                childDiffs = this._mergeObject(source[srcKey], mergingValue, utils.concatPath(path, key), options, isExistingValueArray, override);
                levelDiffs.addChildTracking(childDiffs, key);

            // update primitive
            } else {

                source[srcKey] = mergedValue;

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

MergeDiff.prototype._detectDeletionsAtLevel = function (source, key, delta, levelDiffs, path, options, isSourceArray) {
    var keys = _.keys(source),
        length = keys.length,
        existingValue,
        srcKey,
        i;

    // run source object at this level
    for (i = 0; i < length; i++) {
        key = keys[i];


        if (utils.isValid(delta[key]) && delta[key] !== source[key]) {
            existingValue = source[key];
            if (isSourceArray) {
                srcKey = Number(key) + levelDiffs.arrayOffset;
            } else {
                srcKey = key;
            }
            levelDiffs = this._deleteAtKey(source, path, key, srcKey, options, existingValue,
                isSourceArray, levelDiffs);

        }

    }
    return levelDiffs;
};

MergeDiff.prototype.getPrototypeOf = function (object) {
    return Object.getPrototypeOf(object);
};

MergeDiff.prototype.emitForPath = function (path, tracker) {

    if (tracker.hasAdditions && this.options.emitAdditions) {
        this.additions.emit(path, tracker.additions);
    }

    if (tracker.hasDeletions && this.options.emitAdditions) {
        this.deletions.emit(path, tracker.deletions);
    }

    if (tracker.hasUpdates && this.options.emitAdditions) {
        this.updates.emit(path, tracker.updates);
    }

    if (tracker.hasDifferences && this.options.emitAdditions) {
        console.log("emitting to ", path);
        this.differences.emit(path, tracker.differences);
    }

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