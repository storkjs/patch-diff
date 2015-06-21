/**
 * Created by barakedry on 6/20/15.
 */
'use strict';

function addChildTracker(childTracker, key) {
    if (childTracker.hasAdditions) {
        this.additions[key] = childTracker.deletions;
        this.hasAdditions = true;
    }

    if (childTracker.hasDeletions) {
        this.deletions[key] = childTracker.deletions;
        this.hasDeletions = true;
    }

    if (childTracker.hasUpdates) {
        this.updates[key].old = childTracker.updates.old;
        this.updates[key].new = childTracker.updates.new;
        this.hasUpdates = true;
    }

    if (childTracker.hasDifferences) {
        this.differences[key] = childTracker.differences;
        this.hasDifferences = true;
    }
}

module.exports.create = function createDiffTracker() {
    return {
        hasAdditions: false,
        hasDeletions: false,
        hasUpdates: false,
        hasDifferences: false,
        additions: {},
        deletions: {},
        updates: {'old': {}, 'new': {}},
        differences: {},
        addChildTracking: addChildTracker
    };
};