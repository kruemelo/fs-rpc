// $ npm test
// $ ./node_modules/.bin/mocha -w
var assert = require('chai').assert;
var FSRPC = require('./fs-rpc.js');
var fs = require('fs-extra');
var path = require('path');
var async = require('async');

// http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

/*global assert */
/* //global console */
describe('fs-rpc module', function () {

  it('should have loaded module', function () {
    assert.isFunction(FSRPC);
  });

  describe('client-usage', function () {

    var clientTests = [
      {
        fn: 'mkdir', args: ['/a'],
        rpcStr: '{"fn":"mkdir","args":["/a"]}'
      },
      {
        fn: 'readdir', args: ['/'],
        rpcStr: '{"fn":"readdir","args":["/"]}'
      },
      {
        fn: 'open', args: ['/newFile', 'w', 0666],
        rpcStr: '{"fn":"open","args":["/newFile","w",438]}'
      },
      {
        // fs.write(fd, data[, position[, encoding]], callback)
        fn: 'write', args: [1, 'test data', 0, 'utf8'],
        rpcStr: '{"fn":"write","args":[1,"test data",0,"utf8"]}'
      },
      {
        // fs.write(fd, <buffer>)
        fn: 'writeFile', args: ['/A', str2ab('buffer test')],
        rpcStr: '{"fn":"writeFile","args":["/A","buffer test"],"buffers":[1]}'
      }
    ];

    describe('stringify calls', function ()  {

      it('should have a stringify function', function () {
        assert.isFunction(FSRPC.stringify);
      });

      it('should generate correct rpc-strings', function () {
        // var testBuffer = new ArrayBuffer(42);

        clientTests.forEach(function (test) {
          var actual = FSRPC.stringify(test.fn, test.args);
          assert.equal(actual, test.rpcStr);
        });

      });

    }); // describe stringify calls

  }); // describe client-usage

  
  describe('server-usage', function () {
    
    var validatorConfig = require('./validator-config.json');

    var mountPath = path.join(require('os').tmpDir(), 'fs-rpc-test');

    var fsRPC = new FSRPC(validatorConfig);

    var tests = [
      {
        rpcStr: FSRPC.stringify('mkdir', '/x'),
        rpc: {fn: 'mkdir', args: [path.join(mountPath, '/x')]},
        execResult: []
      },
      {
        rpcStr: FSRPC.stringify('rename', ['/x','/a']),
        rpc: {fn: 'rename', 
          args: [
            path.join(mountPath, '/x'),
            path.join(mountPath, '/a')
          ]
        },
        execResult: []
      },
      {
        rpcStr: FSRPC.stringify('readdir', '/'),
        rpc: {fn: 'readdir', args: [path.join(mountPath, '/')]},
        execResult: [['a']]
      },
      // {
      //   rpcStr: '{"fn":"open","args":["/newFile","w",438]}',
      //   rpc: {fn: 'open', args: ['/newFile', 'w', 0666]},
      //   execResult: [undefined]
      // },
      {
        // fs.write(fd, data[, position[, encoding]], callback)
        // rpcStr: '{"fn":"writeFile","args":["/A","buffer test"],"buffers":[1]}',
        rpcStr: FSRPC.stringify('writeFile', ['/A', str2ab('buffer \u00bd + \u00bc = \u00be test')]),
        rpc: {fn: 'writeFile', args: [path.join(mountPath, '/A'), new Buffer('buffer \u00bd + \u00bc = \u00be test')],'buffers':[1]},
        execResult: [] 
      }
      // {
      //   rpcStr: FSRPC.stringify('stat', '/'),
      //   rpc: {fn: 'stat', args: ['/']},
      //   execResult: [['a']]
      // }
    ];

    before(function (done) {
      fs.emptyDir(mountPath, done);
    });

    describe('parse rpc-strings', function () {

      it('should parse rpc-strings', function () {
  
        assert.isFunction(fsRPC.parse);

        assert.isNull(fsRPC.parse('{"fn":"unsupportedFunction","args":[]}', mountPath));

        tests.forEach(function (test) {
          var actual = fsRPC.parse(test.rpcStr, mountPath);      
          assert.deepEqual(actual, test.rpc);
        });

      });

    }); // describe parse


    describe('validation', function () {

      it('should have validate function', function () {
        assert.isFunction(fsRPC.validate);
      });

      it('should return an error if function name rpc.fn is not set in config', function () {
        var actual;

        actual = fsRPC.validate({args: []}, mountPath);
        assert.instanceOf(actual, Error);

        actual = fsRPC.validate({fn: 'unsupportedFunction', args: []}, mountPath);
        assert.instanceOf(actual, Error);

      });

      it('should return null for function names set in config', function () {
        var actual;
// console.log('test: validatorConfig', fsRPC.validators);
        actual = fsRPC.validate(tests[0].rpc, mountPath);
        assert.equal(actual, null);
      });

      it('should validate argument data types', function () {

        var actual;

        actual = fsRPC.validate(tests[0].rpc, mountPath);
        assert.equal(actual, null);

        actual = fsRPC.validate({fn: 'mkdir'}, mountPath);
        assert.instanceOf(actual, Error);

        actual = fsRPC.validate({fn: 'mkdir', args: [true]}, mountPath);
        assert.instanceOf(actual, Error);

      });

      it('should validate path arguments', function () {

        var actual;

        // with valid paths
        actual = fsRPC.validate(tests[0].rpc, mountPath);
        assert.equal(actual, null);

        actual = fsRPC.validate(tests[0].rpc, '/');
        assert.equal(actual, null);

        actual = fsRPC.validate(tests[0].rpc, '/invalid/path');
        assert.instanceOf(actual, Error);

        actual = fsRPC.validate({fn: 'mkdir', args: ['/a/..']}, '/');
        assert.equal(actual, null);

        actual = fsRPC.validate({fn: 'mkdir', args: ['/a/.']}, '/');
        assert.equal(actual, null);

        actual = fsRPC.validate({fn: 'mkdir', args: ['/a/..']}, '/a');
        assert.instanceOf(actual, Error);

      });

    }); // describe validation


    describe('execution', function () {

      it('should have execution function', function () {
        assert.isFunction(fsRPC.execute);
      });

      it('should return error on executing undefined function', function (done) {
        fsRPC.execute(fs, {fn: 'undefinedFunction'}, function (err) {  
          assert.instanceOf(err, Error);
          done();
        });
      });

      it('should execute rpc on fs', function (done) {

        async.eachSeries(
          tests,
          function (test, testDone) {
            fsRPC.execute(fs, test.rpc, function () {
              var result = Array.prototype.slice.call(arguments, 1),
                errArg = arguments[0];
              assert.isNull(errArg);
              assert.deepEqual(result, test.execResult);
              testDone();
            });
          },
          done
        );

      });
      

    }); // describe execution
  }); // describe server-usage


}); // describe fs-rpc module


