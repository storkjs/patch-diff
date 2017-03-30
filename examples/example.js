/**
 * Created by barakedry on 30/03/2017.
 */
'use strict';

const MergeDiff = require('../index.js');

let merger =  new MergeDiff({
    test: 'asd'
});


merger.on('PATH:myRoot.item', (diff) => {
   console.log('myRoot.item change', diff);
});

merger.merge({myRoot: {item: {prop: 'added'}}});
merger.merge({prop: 'changed'}, 'myRoot.item');
merger.override({myRoot: {item: { aDifferentProp: 'hi'}}});
merger.merge({item: {aDifferentProp: merger.options.deleteKeyword}}, 'myRoot'); // splice the item at index 1
console.log('final', merger.get());


merger.on('PATH:myRoot.array', (diff) => {
    console.log('myRoot.array change', diff);
});

merger.merge([1, 2, 3], 'myRoot.array');
merger.merge([1, 2, 3, 4], 'myRoot.array');
merger.merge({1: merger.options.deleteKeyword}, 'myRoot.array'); // splice the item at index 1
console.log('final2', merger.get());