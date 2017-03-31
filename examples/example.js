/**
 * Created by barakedry on 30/03/2017.
 */
'use strict';

const MergeDiff = require('../index.js');

let merger =  new MergeDiff({
    test: 'asd'
});

// add event handler for changes on path myRoot.item
merger.on('PATH:myRoot.item', (diff) => {
   console.log('myRoot.item change', diff);
});

merger.merge({myRoot: {item: {prop: 'added'}}});
merger.merge({prop: 'changed'}, 'myRoot.item');
merger.override({myRoot: {item: { aDifferentProp: 'hi'}}}); // override enforce a specific state
merger.merge({item: {aDifferentProp: merger.options.deleteKeyword}}, 'myRoot'); // delete aDifferentProp key
console.log('final', merger.get());


// add event handler for changes on path myRoot.array
merger.on('PATH:myRoot.array', (diff) => {
    console.log('myRoot.array change', diff);
});

merger.merge([1, 2, 3], 'myRoot.array');
merger.merge([1, 2, 3, 4], 'myRoot.array');
merger.merge({1: merger.options.deleteKeyword}, 'myRoot.array'); // splice the item at index 1
console.log('final2', merger.get());



// sync 2 objects with merger
let obj1 = {};
let obj2 = {};

let merger1 = new MergeDiff(obj1);
let merger2 = new MergeDiff(obj2);

// handle root changes
merger1.on('PATH:myRoot', (diff) => {
    // patch obj2 with differences from obj1
    merger2.merge(diff.differences, 'myRoot');
});


// modify obj1;
merger1.merge({prop: 'changed'}, 'myRoot.item');
merger1.merge({prop2: 'changed'}, 'myRoot.item2');
merger1.merge({array: [1,2,3]}, 'myRoot.item3');
merger1.merge({1: merger.options.deleteKeyword}, 'myRoot.array'); // splice the item at index 1
merger1.override({prop2: {newobj: 'new property'}}, 'myRoot.item2'); // splice the item at index 1

console.log('obj1=', JSON.stringify(obj1, 4, 4));
console.log('obj2=', JSON.stringify(obj2, 4, 4));


const PatcherProxy = require('../lib/patcher-proxy');

let pp = PatcherProxy.create(merger1, 'myRoot');

console.log('obj2 before proxy changes',  JSON.stringify(obj2, 4, 4));
pp.item2.prop2 = 'test';
pp.item3.aaa = 'tes2';
pp.item3.bbb = 'test3';
delete pp.item3.bbb;
delete pp.item.prop;
setTimeout(() => {
    console.log('obj2 after proxy changes',  JSON.stringify(obj2, 4, 4));
    pp.item2 = {
        prop: 'overriden'
    };
}, 0);
