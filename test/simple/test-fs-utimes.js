var common = require('../common');
var assert = require('assert');
var util = require('util');
var fs = require('fs');

var tests_ok = 0;
var tests_run = 0;

function stat_resource(resource) {
  if (typeof resource == 'string') {
    return fs.statSync(resource);
  } else {
    // ensure mtime has been written to disk
    fs.fsyncSync(resource);
    return fs.fstatSync(resource);
  }
}

function check_mtime(resource, mtime) {
  var mtime = fs._toUnixTimestamp(mtime);
  var stats = stat_resource(resource);
  var real_mtime = fs._toUnixTimestamp(stats.mtime);
  // check up to single-second precision
  // sub-second precision is OS and fs dependant
  return Math.floor(mtime) == Math.floor(real_mtime);
}

function expect_errno(syscall, resource, err, errno) {
  if (err && err.code == errno) {
    tests_ok++;
  } else {
    console.log('FAILED:', arguments.callee.name, util.inspect(arguments));
  }
}

function expect_ok(syscall, resource, err, atime, mtime) {
  if (!err && check_mtime(resource, mtime)) {
    tests_ok++;
  } else {
    console.log('FAILED:', arguments.callee.name, util.inspect(arguments));
  }
}

// the tests assume that __filename belongs to the user running the tests
// this should be a fairly safe assumption; testing against a temp file
// would be even better though (node doesn't have such functionality yet)
function runTests(atime, mtime, callback) {

  var fd, err;
  //
  // test synchronized code paths, these functions throw on failure
  //
  function syncTests() {
    fs.utimesSync(__filename, atime, mtime);
    expect_ok('utimesSync', __filename, undefined, atime, mtime);
    tests_run++;

    fs.futimesSync(fd, atime, mtime);
    expect_ok('futimesSync', fd, undefined, atime, mtime);
    tests_run++;

    err = undefined;
    try {
      fs.utimesSync('foobarbaz', atime, mtime);
    } catch (ex) {
      err = ex;
    }
    expect_errno('utimesSync', 'foobarbaz', err, 'ENOENT');
    tests_run++;

    err = undefined;
    try {
      fs.futimesSync(-1, atime, mtime);
    } catch (ex) {
      err = ex;
    }
    expect_errno('futimesSync', -1, err, 'EBADF');
    tests_run++;
  }

  //
  // test async code paths
  //
  fs.utimes(__filename, atime, mtime, function(err) {
    expect_ok('utimes', __filename, err, atime, mtime);

    fs.utimes('foobarbaz', atime, mtime, function(err) {
      expect_errno('utimes', 'foobarbaz', err, 'ENOENT');

      // don't close this fd
      fd = fs.openSync(__filename, 'r');

      fs.futimes(fd, atime, mtime, function(err) {
        expect_ok('futimes', fd, err, atime, mtime);

        fs.futimes(-1, atime, mtime, function(err) {
          expect_errno('futimes', -1, err, 'EBADF');
          syncTests();
          callback();
        });
        tests_run++;
      });
      tests_run++;
    });
    tests_run++;
  });
  tests_run++;
}

var stats = fs.statSync(__filename);

runTests(new Date('1982-09-10 13:37'), new Date('1982-09-10 13:37'), function() {
  runTests(new Date(), new Date(), function() {
    runTests(1234.5678, 1234.5678, function() {
      runTests(stats.mtime, stats.mtime, function() {
        // done
      });
    });
  });
});

process.on('exit', function() {
  console.log('Tests run / ok:', tests_run, '/', tests_ok);
  assert.equal(tests_ok, tests_run);
});
