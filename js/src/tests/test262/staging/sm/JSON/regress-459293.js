/*
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 */

/*---
includes: [sm/non262.js, sm/non262-shell.js]
flags:
  - noStrict
description: |
  pending
esid: pending
---*/
//-----------------------------------------------------------------------------
var BUGNUMBER = 459293;
var summary = 'Allow redeclaration of JSON';
var actual = '';
var expect = '';
 
  try
  {
    eval('var JSON = "foo";');
  }
  catch(ex)
  {
    actual = ex + '';
  }
  assert.sameValue(expect, actual, summary);

reportCompare(0, 0);
