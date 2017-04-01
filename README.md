# patch-diff

[![NPM Version](http://img.shields.io/npm/v/patch-diff.svg?style=flat)](https://www.npmjs.org/package/patch-diff) [![Build Status](https://travis-ci.org/storkjs/patch-diff.svg)](http://travis-ci.org/storkjs/patch-diff) [![Coverage Status](https://coveralls.io/repos/storkjs/patch-diff/badge.svg)](https://coveralls.io/r/storkjs/patch-diff) [![bitHound Code](https://www.bithound.io/github/storkjs/patch-diff/badges/code.svg)](https://www.bithound.io/github/storkjs/patch-diff)<br>
[![License](https://img.shields.io/npm/l/patch-diff.svg?style=flat)](https://github.com/storkjs/patch-diff/blob/master/LICENSE) [![Total Downloads](https://img.shields.io/npm/dt/patch-diff.svg?style=flat)](https://www.npmjs.org/package/patch-diff) [![Dependency Status](https://david-dm.org/storkjs/patch-diff.svg)](https://david-dm.org/storkjs/patch-diff) [![devDependency Status](https://david-dm.org/storkjs/patch-diff/dev-status.svg)](https://david-dm.org/storkjs/patch-diff#info=devDependencies)<br>
[![Retire Status](http://retire.insecurity.today/api/image?uri=https://raw.githubusercontent.com/storkjs/patch-diff/master/package.json)](http://retire.insecurity.today/api/image?uri=https://raw.githubusercontent.com/storkjs/patch-diff/master/package.json)

> Wrap ANY JSON object with a proxy that seamlessly lets you get notified about any changes to your object as events.

> Seamlessly link any JS object to your proxy to keep it constantly updated without hassle.


#### This Library is currently under initial development! - do not use in production
But feel free to fork, add some tests, and open some bugs if you find them.


## Installation

## Usage

a `PatchDiff` instance wraps an object and provides a convenient API for updating it while emitting events about every change.

It has the following api:

Assuming we create a patcher for an empty object with `patcher = new PatchDiff({});`
- `patcher.get(path)` - returns the value at path of object (json path), this is a reference
- `patcher.remove(path)` - removes the value at path
- `patcher.apply(patch, path)` - this is the most important one, it allows you to patch the wrapped object with partial object (the patch)
- `patcher.override(fullDocument, path, options)` - sort of like assign or set.
  Completly replaces the previous values at the specificed `path` with `fullDocument`.
  The patch structure should be the same on a specific path, undefined values are ignored while every other is treated as assignments

`apply`, `override` and `remove` methods modify the wrapped object, emitting events for each change


  




## Concepts

### How events are emitted

`PatchDiff` extends `EventEmitter`.

When `apply`, `override` and `remove` methods modify the wrapped object, they emit events for each change.

Each leaf changed by the `apply`, `override` and `remove` methods is checked against the wrapped object at the `path` specified for changing.
If there is a difference it is tracked and emitted as a patch.

### Event handlers

TBD - barak?

### Event names

You are here because you want to listen to events. The event naming convention follows the JSON structure.

#### Simple object

Given object
```
{ hey:   'hey value',
  there: 'there value'
}
```
changes to `hey value` will be broad-cast to anyone listening to `hey` or `*`.

`*` is a wildcard used for retrieving all events for an object.


#### More complex hierarchy
Given object
```
{
    hey: {
        hey1: 'hey1 value',
        hey2: 'hey2 value'
    },
    there: 'there value'
}
```
changes to `hey1 value` will be broad-cast to anyone listening to `hey.hey1`, `hey` or `*`.


#### Array

#### Array in a more complex hierarchy