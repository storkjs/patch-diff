/**
 * Created by barakedry on 30/03/2017.
 */
/* eslint object-curly-spacing: 'off'*/
/* eslint object-curly-newline: 'off'*/
/* eslint no-console: 'off'*/
'use strict';

const PatchDiff = require('../index.js');

let patcher = new PatchDiff({
    test: 'asd'
});

// add event handler for changes on path myRoot.item
patcher.on('myRoot.item', (diff) => {
    console.log('myRoot.item change', diff);
});

patcher.apply({myRoot: {item: {prop: 'added'}}});
patcher.apply({prop: 'changed'}, 'myRoot.item');
patcher.override({myRoot: {item: { aDifferentProp: 'hi'}}}); // override enforce a specific state
patcher.apply({item: {aDifferentProp: patcher.options.deleteKeyword}}, 'myRoot'); // remove aDifferentProp key
console.log('final', patcher.get());


// add event handler for changes on path myRoot.array
patcher.on('myRoot.array', (diff) => {
    console.log('myRoot.array change', diff);
});

patcher.apply([1, 2, 3], 'myRoot.array');
patcher.apply([1, 2, 3, 4], 'myRoot.array');
patcher.apply({1: patcher.options.deleteKeyword}, 'myRoot.array'); // splice the item at index 1
console.log('final2', patcher.get());


// sync 2 objects with patcher
let obj1 = {};
let obj2 = {};

let patcher1 = new PatchDiff(obj1);
let patcher2 = new PatchDiff(obj2);

// handle root changes
patcher1.on('myRoot', (diff) => {
    // patch obj2 with differences from obj1
    patcher2.apply(diff.differences, 'myRoot');
});


// modify obj1;
patcher1.apply({prop: 'changed'}, 'myRoot.item');
patcher1.apply({prop2: 'changed'}, 'myRoot.item2');
patcher1.apply({array: [1, 2, 3]}, 'myRoot.item3');
patcher1.apply({1: patcher.options.deleteKeyword}, 'myRoot.array'); // splice the item at index 1
patcher1.override({prop2: {newobj: 'new property'}}, 'myRoot.item2'); // splice the item at index 1

console.log('obj1=', JSON.stringify(obj1, 4, 4));
console.log('obj2=', JSON.stringify(obj2, 4, 4));

// proxy usage
const PatcherProxy = require('../lib/patcher-proxy');

let pp = PatcherProxy.create(patcher1, 'myRoot');

console.log('obj2 before proxy changes', JSON.stringify(obj2, 4, 4));
pp.item2.prop2 = 'test'; // change value of existing property
pp.item3.aaa = 'tes2';  // define and assign new property to existing object
pp.item3.bbb = 'test3';  // define and assign new property to existing object
delete pp.item3.bbb; // remove property that didn't exists before
delete pp.item.prop; // remove existing property
setTimeout(() => {
    console.log('obj2 after proxy changes', JSON.stringify(obj2, 4, 4));
    pp.item2 = {
        prop: 'overriden'
    };
}, 0);
