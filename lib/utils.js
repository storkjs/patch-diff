/**
 * Created by barakedry on 6/19/15.
 */
'use strict';

var Utils = {
    isValid: function (val) {
        // val === val for cases val is NaN value
        return val !== undefined && val === val;
    },
    concatPath: function (path, suffix) {
        if (path && suffix) {
            return [path, suffix].join(".");
        } else {
            return path || suffix;
        }
    },
    wrapByPath: function wrapByPath(value, path) {

        var levels, wrapper, curr, i, len;

        if (!path) {
            return value;
        }

        levels = path.split('.');
        len = levels.length;
        i = 0;
        wrapper = {};
        curr = wrapper;

        while(i < (len -1)) {
            curr[levels[i]] = {};
            curr = curr[levels[i]];
            i++;
        }

        curr[levels[i]] = value;

        return wrapper;
    },

    SERIALIZABLE_FUNCTION: {toJSON: function () { return "function()"; }}
};

module.exports = Utils;