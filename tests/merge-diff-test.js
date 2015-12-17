/**
 * Created by barakedry on 6/21/15.
 */
/*global describe: false, it: false */

'use strict';

var MergeDiff = require('../');
var chai = require('chai');
var assert = chai.assert;
var extend = require('node.extend');
var EventEmitterEnhancer = require('event-emitter-enhancer');

describe("merge-diff", function () {
    function createBaseObject() {
        return {
            string: "string",
            number: 5,
            boolean: true,
            array: [0, 1, '2', false, {prop: 'val'}],
            obj: {
                property: "value1",
                property2: "value2"
            },
            nested: {
                a: {
                    b: {
                        c: {
                            d: {
                                property: "value1",
                                property2: "value2"
                            }
                        }
                    }
                }
            }
            /*
             func: function () {
             return "hello";
             }
             */
        };
    }

    function createSmallObject() {
        return {
            new1: 'yes',
            new2: {
                myobj: true
            }
        };
    }

    describe("merge", function () {
        describe('merging the number 20 to the path "string"', function () {

            var merger = new MergeDiff(createBaseObject());
            var expectedObject = createBaseObject();

            expectedObject.string = 20;

            it('merged object should be the same as expected object', function () {
                merger.merge(20, 'string');
                assert.deepEqual(merger.object, expectedObject);
            });

        });

        describe('merging the string "test" to 3 existing properties with no path (to root)', function () {

            var merger = new MergeDiff(createBaseObject());
            var originalObject = createBaseObject();

            it('merged object should be the same as expected object', function () {

                merger.merge({
                    string: "test",
                    boolean: "test",
                    number: "test"
                });

                assert.equal(merger.object.string, 'test');
                assert.equal(merger.object.boolean, 'test');
                assert.equal(merger.object.number, 'test');
                assert.notEqual(merger.object.array, 'test');
                assert.deepEqual(merger.object.nested, originalObject.nested);
            });

        });

        describe('merging 2 string properties and a new object with no path (to root)', function () {

            var merger = new MergeDiff(createBaseObject());

            it('merged object should be the same as expected object', function () {

                merger.merge({
                    string: "test",
                    boolean: false,
                    newobject: {"test": "test"}
                });

                assert.equal(merger.get('string'), 'test');
                assert.equal(merger.object.boolean, false);
                assert.deepEqual(merger.object.newobject, {test: 'test'});
            });

        });

        describe('merging 4 items to array existing, modified, new and deleted', function () {

            var merger = new MergeDiff(createBaseObject());

            it('1 item should be modified 1 deleted and one added', function () {

                merger.on("array", function (diff) {
                    assert.deepEqual(diff.differences, {'2': 'test', 4: merger.options.deleteKeyword, 7: "test2"});
                });

                merger.merge({
                    array: {1: 1, '2': 'test', 4: merger.options.deleteKeyword, 7: "test2"}
                });

                //[0, 1, '2', false, {prop: 'val'}]
                //[0, 1, 'test', false, null, null, 'test2]

                assert.deepEqual(merger.object.array, [0, 1, 'test', false, , , 'test2']);
            });

        });

        describe('delete a string and boolean', function () {

            var merger = new MergeDiff(createBaseObject());

            it('merged object should be the same as expected object', function () {

                merger.merge({
                    boolean: merger.options.deleteKeyword,
                    string: merger.options.deleteKeyword
                });

            });

        });

        describe('merge nested object to "nested.a"', function () {

            var merger = new MergeDiff(createBaseObject());

            it('merged object should be the same as expected object', function () {

                merger.on("nested", function (diff) {
                    //console.log('diff', diff.differences);
                    return undefined;
                });

                merger.merge({
                    b: {'added': 'asd', c: {d: {property2: undefined}}}
                }, 'nested.a');

                //[0, 1, '2', false, {prop: 'val'}]
                //[0, 1, 'test', false, null, null, 'test2]

                //expect(merger.object).property('array').to.deep.equal([0, 1, 'test', false, undefined, undefined, 'test2']);
            });

        });

        describe('nested', function () {
            it('change 1 nested object', function () {
                var merger = new MergeDiff(createBaseObject());
                var expectedObject = createBaseObject();
                extend(true, expectedObject.nested.a.b.c, createSmallObject());

                var specificEvent = false;
                merger.on('merge', function () {
                    if (specificEvent) {
                        assert.fail();
                    }
                    specificEvent = true;
                });
                var generalEvent = false;
                merger.on('change', function () {
                    if (generalEvent) {
                        assert.fail();
                    }
                    generalEvent = true;
                });

                merger.merge(createSmallObject(), 'nested.a.b.c');

                assert.deepEqual(merger.object, expectedObject);
                assert.isTrue(specificEvent);
                assert.isTrue(generalEvent);

                merger.merge(createSmallObject(), 'nested.a.b.c');

                assert.deepEqual(merger.object, expectedObject);
            });
        });
    });

    describe("override", function () {
        describe('nested', function () {
            it('override top level', function () {
                var merger = new MergeDiff(createBaseObject());
                var expectedObject = createBaseObject();
                delete expectedObject.number;
                expectedObject.number = createSmallObject();

                var specificEvent = false;
                merger.on('override', function () {
                    if (specificEvent) {
                        assert.fail();
                    }
                    specificEvent = true;
                });
                var generalEvent = false;
                merger.on('change', function () {
                    if (generalEvent) {
                        assert.fail();
                    }
                    generalEvent = true;
                });

                merger.override(createSmallObject(), 'number');

                assert.deepEqual(merger.object, expectedObject);
                assert.isTrue(specificEvent);
                assert.isTrue(generalEvent);

                merger.override(createSmallObject(), 'number');

                assert.deepEqual(merger.object, expectedObject);
            });

            it('override 1 nested object', function () {
                var merger = new MergeDiff(createBaseObject());
                var expectedObject = createBaseObject();
                delete expectedObject.nested.a.b.c;
                expectedObject.nested.a.b.c = createSmallObject();

                merger.override(createSmallObject(), 'nested.a.b.c');

                assert.deepEqual(merger.object, expectedObject);
            });

            it('override array', function () {
                var merger = new MergeDiff({});
                var expectedObject = createBaseObject();

                merger.override(createBaseObject(), '');

                assert.deepEqual(merger.object, expectedObject);
            });
        });
    });

    describe("delete", function () {
        describe('primitives', function () {
            it('delete 1 primitive', function () {
                var merger = new MergeDiff(createBaseObject());
                var expectedObject = createBaseObject();
                delete expectedObject.number;

                var specificEvent = false;
                merger.on('delete', function () {
                    if (specificEvent) {
                        assert.fail();
                    }
                    specificEvent = true;
                });
                var generalEvent = false;
                merger.on('change', function () {
                    if (generalEvent) {
                        assert.fail();
                    }
                    generalEvent = true;
                });

                merger.delete('number');

                assert.deepEqual(merger.object, expectedObject);
                assert.isTrue(specificEvent);
                assert.isTrue(generalEvent);

                merger.delete('number');

                assert.deepEqual(merger.object, expectedObject);
            });
        });

        describe('nested', function () {
            it('delete 1 nested object', function () {
                var merger = new MergeDiff(createBaseObject());
                var expectedObject = createBaseObject();
                delete expectedObject.nested.a.b.c;

                merger.delete('nested.a.b.c');

                assert.deepEqual(merger.object, expectedObject);
            });
        });
    });

    describe("differences events", function () {
        it('add', function () {
            var merger = new MergeDiff({}, {
                pathEventPrefix: 'TEST:'
            });

            var expectedEvents = [
                'merge',
                'change',
                'TEST:*',
                'TEST:subObject',
                'TEST:subObject.sub2'
            ];

            EventEmitterEnhancer.modifyInstance(merger);
            merger.else(function (event) {
                if (expectedEvents.indexOf(event) !== -1) {
                    expectedEvents.splice(expectedEvents.indexOf(event), 1);
                } else {
                    assert.fail(event);
                }
            });

            merger.merge({
                key: 1,
                subObject: {
                    key: 2,
                    sub2: {
                        key: 3
                    }
                }
            });

            assert.equal(0, expectedEvents.length);
        });
    });
});
