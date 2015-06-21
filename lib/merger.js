/**
 * Created by barakedry on 6/19/15.
 */
'use strict';
var  _ = require('lodash');
var  utils = require('./utils');
var DiffTracker = require('./diff-tracker');

function Merger (object, options) {
    this.options = _.defaults(options, {
        emitEvents: true,
        deleteKeyword: '__[DELETE]__',
        protoKeyword: '__[proto]__',
        mergeDeletions: true,
        mergeAdditions: true,
        emitAdditions: true,
        emitUpdates: true,
        emitDifferences: true
    });

    // event emitters

    this.object = object || {};
    this.prototypes = []; // prototypes are stored in a special collection
}

Merger.prototype.merge = function (delta, path, context, options) {

    options = _.defaults(options, this.options);

    if (!_.isObject(delta) && !path) {
        console.error('invalid merge, source and delta must be objects');
        return;
    }

    this._mergeObject(this.object, utils.wrapByPath(delta, path), "", context, options);
};


Merger.prototype._mergeObject = function merge (source, delta, path, context, options, emitters) {
    var keys,
        key,
        i,
        trackedDiffs,
        childDiffs,
        mergingValue,
        existingValue,
        mergedValue, // this value is what goes out to the tracker its not allways the same as mergingValue
        isObjectMerge = false;

    if (!(_.isObject(source) && _.isObject(delta))) {
        console.warn('invalid merge, source and delta must be objects');
        return;
    }

    if (options.emitEvents) {
        trackedDiffs = DiffTracker.create();
    }

    keys = _.keys(delta);
    for (i = 0; i < keys.length; i++) {
        key = keys[i];

        if (utils.isValid(delta[key]) && delta[key] !== source[key]) {

            mergingValue = delta[key];

            if (_.isFunction(mergingValue)) {
                mergedValue = utils.SERIALIZABLE_FUNCTION;
            } else {
                isObjectMerge = _.isObject(mergingValue);
                mergedValue = mergingValue;
            }

            // new
            if (source[key] === undefined) {
                if (options.mergeAdditions && delta[key] !== options.deleteKeyword) {


                    if (isObjectMerge) {

                        source[key] = Object.create(this.getPrototypeOf(mergingValue));
                        childDiffs = this._mergeObject(source[key], mergingValue, utils.concatPath(path, key), context, emitters);
                        trackedDiffs.addChildTracking(childDiffs, key);

                    } else {

                        source[key] = mergingValue;
                        trackedDiffs.additions[key] = mergingValue;
                        trackedDiffs.differences[key] = mergingValue;
                        trackedDiffs.hasAdditions = true;

                    }

                }
            // existing
            } else {

                existingValue = source[key];

                // delete
                if (delta[key] === options.deleteKeyword) {

                    if (options.mergeAdditions) {
                        delete source[key];
                    }

                    trackedDiffs.deletions[key] = existingValue;
                    trackedDiffs.differences[key] = options.deleteKeyword;
                    trackedDiffs.hasDeletions = true;

                    this.emitInnerDeletions(path, existingValue);

                // modify
                } else {

                    if (isObjectMerge) {

                        // not the same type
                        if (!(typeof existingValue === 'object'  &&
                              (_.isArray(existingValue) === _.isArray(mergingValue)))) {

                            // handle prototypes
                            source[key] = Object.create(this.getPrototypeOf(mergingValue))

                        }

                        childDiffs = this._mergeObject(source[key], mergingValue, path, context, emitters);
                        trackedDiffs.addChildTracking(childDiffs, key);

                    } else {
                        trackedDiffs.hasUpdates = true;
                        trackedDiffs.updates[key].old = existingValue;
                        trackedDiffs.updates[key].new = mergedValue;

                        trackedDiffs.hasDifferences = true;
                        trackedDiffs.differences[key] = mergedValue;
                    }

                }

            }

        }

    }

    this.emitForPath(path || "*", trackedDiffs);

    return trackedDiffs;
};

Merger.prototypes.getPrototypeOf = function (object) {
    return Object.getPrototypeOf(object);
};

Merger.prototypes.emitForPath = function (path, tracker) {

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
        this.differences.emit(path, tracker.differences);
    }

};

Merger.prototypes.emitInnerDeletions = function (deletedObject, path) {
    var keys, key, i;

    if (!_.isObject(deletedObject)) {
        return;
    }

    keys = _.keys(deletedObject);
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        if (_.isObject(delta[key])) {
            this.emitInnerDeletions(deletedObject[key], utils.concatPath(path, key));
        }
    }

    this.deletions.emit(path, deletedObject);
    this.difference.emit(path, this.options.deleteKeyword);
};

module.exports = Merger;