// $ npm test
// $ ./node_modules/.bin/mocha -w
var assert = require('chai').assert;
var FSRPC = require('./fs-rpc.js');
var fsExtra = require('fs-extra');
var rpcFS = require('rpc-fs');
var path = require('path');
var os = require('os');
var async = require('async');

// http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
// function ab2str(buf) {
//   return String.fromCharCode.apply(null, new Uint16Array(buf));
// }
// function str2ab(str) {
//   var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
//   var bufView = new Uint16Array(buf);
//   for (var i=0, strLen=str.length; i &lt; strLen; i++) {
//     bufView[i] = str.charCodeAt(i);
//   }
//   return buf;
// }

// http://stackoverflow.com/questions/17191945/conversion-between-utf-8-arraybuffer-and-string
// function uintToString (uintArray) {
//     var encodedString = String.fromCharCode.apply(null, uintArray),
//         decodedString = decodeURIComponent(escape(encodedString));
//     return decodedString;
// }   

// function stringToByteArray (str) {
//   return JSON.parse(JSON.stringify(new Buffer(str, 'utf8'))).data;
// }

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

/*global assert */
/* //global console */
describe('fs-rpc module', function () {

  it('should have loaded module', function () {
    assert.isObject(FSRPC, 'FSRPC should be object');
  });


  describe('FSRPC static methods', function () {

    it('should convert to and from ArrayBuffer', function () {

      var testStr = 'buffer \u00bd + \u00bc = \u00be test',
        buffer,
        toStr;

      assert.isFunction(FSRPC.stringToArrayBuffer, 'stringToArrayBuffer');
      assert.isFunction(FSRPC.arrayBufferToString, 'arrayBufferToString');

      buffer = FSRPC.stringToArrayBuffer(testStr);

      assert.instanceOf(buffer, ArrayBuffer);

      toStr = FSRPC.arrayBufferToString(buffer);

      assert.strictEqual(toStr, testStr);
    });

  }); // describe FSRPC static methods


  describe('FSRPC.Client', function () {

    it('should have a client constructor', function () {

      var fsrpc;

      assert.isFunction(FSRPC.Client);

      fsrpc = new FSRPC.Client();
      assert.isObject(fsrpc);
    });


    var clientTests = [
      {
        rpc: [{fn: 'mkdir', args: '/a'}],
        rpcStr: '[{"fn":"mkdir","args":["/a"]}]'
      },
      {
        rpc: [{fn: 'readdir', args: ['/']}],
        rpcStr: '[{"fn":"readdir","args":["/"]}]'
      },
      {
        rpc: [
          {fn: 'open', args: ['/newFile', 'w', 0666]},
          {fn: 'write', args: [1, 'test data', 0, 'utf8']}
        ],
        rpcStr: '[{"fn":"open","args":["/newFile","w",438]},{"fn":"write","args":[1,"test data",0,"utf8"]}]'
      },
      {
        rpc: [{fn: 'writeFile', args: ['/A', str2ab('buffer \u00bd + \u00bc = \u00be test')]}],
        rpcStr: '[{"fn":"writeFile","args":["/A","buffer ½ + ¼ = ¾ test"]}]'
      }
    ];

    describe('Client.stringify remote procedure calls', function ()  {
      

      it('should have a stringify function', function () {
        var fsrpc = new FSRPC.Client();
        assert.isFunction(fsrpc.stringify);
      });


      it('should generate correct rpc-string', function () {
        // var testBuffer = new ArrayBuffer(42);

        clientTests.forEach(function (test) {          

          var fsrpc = new FSRPC.Client();

          test.rpc.forEach(function (testRPC) {
            fsrpc.add(testRPC.fn, testRPC.args);
          });

          assert.equal(fsrpc.stringify(), test.rpcStr);
        });

      });

    }); // describe stringify calls


    describe('Client.parse', function () {

      var fsrpc = new FSRPC.Client();

      it('should have a parse function', function () {
        assert.isFunction(fsrpc.parse);
      });

      it('should parse rpc results', function () {
        
        var resultListStr = '['
              + '{"data":[null,{"size":123}]}'
              + ',{"data":[null,{"dirY":{"size":456}}]}'
              + ',{"data":[null,"ZmlsZTAgY29udGVudA=="]}'
              + ',{"data":[{}],"error":{"name":"Error","message":"msg"}}'
              + ',{"data":[null,"YnVmZmVyIMK9ICsgwrwgPSDCviB0ZXN0"],"buffers":[1]}'
              + ']',
          parsed = fsrpc.parse(resultListStr);

        assert.isArray(parsed);

        assert.equal(parsed[0][0], null);
        assert.equal(parsed[0][1].size, 123);
        assert.equal(parsed[1][1].dirY.size, 456);
        assert.equal(parsed[2][1], 'ZmlsZTAgY29udGVudA==');
        assert.instanceOf(parsed[3][0], Error);
        assert.instanceOf(parsed[4][1], ArrayBuffer);
        assert.equal(parsed[4][1].byteLength, 42);
        assert.equal(ab2str(parsed[4][1]), 'buffer \u00bd + \u00bc = \u00be test');
      });

    }); // describe Client.parse

  }); // describe FSRPC.Client

  
  describe('FSRPC.Server', function () {
    
    var validatorConfig = require('./validator-config.json'),
      mountPath = path.join(os.tmpDir(), 'fs-rpc-test');

    before(function (done) {
      var fixturesPath = path.join(__dirname, 'fixtures', 'testFS');
      fsExtra.emptyDirSync(mountPath);
      fsExtra.copySync(fixturesPath, mountPath);    
      done();
    });


    describe('FSRPC.Server instance', function () {

      it('should have a constructor', function () {
        assert.isFunction(FSRPC.Server);
        assert.isFunction(new FSRPC.Server(), 'server constructor should return a function');
      });

    });

    describe('FSRPC.Server static functions', function () {

      describe('Server.parse rpc-strings', function () {

        it('should parse rpc-strings', function () {

          var client,
            actual;
    
          assert.isFunction(FSRPC.Server.parse);

          assert.deepEqual(FSRPC.Server.parse(
            'invalid json string', 
            validatorConfig, 
            mountPath
          ), null);

          assert.deepEqual(FSRPC.Server.parse(
            '[{"fn":"unsupportedFunction","args":[]}]', 
            validatorConfig, 
            mountPath
          ), [null]);


          client = new FSRPC.Client();
          client.add('mkdir', '/x');

          actual = FSRPC.Server.parse(client.stringify(), validatorConfig, mountPath);      
          assert.deepEqual(
            actual, [{fn: 'mkdir', args: [path.join(mountPath, '/x')]}]
          );

          client = new FSRPC.Client();
          client.add('writeFile', ['/x', str2ab('buffer \u00bd + \u00bc = \u00be test')]);

          actual = FSRPC.Server.parse(client.stringify(), validatorConfig, mountPath);      
          assert.deepEqual(
            actual, 
            [{fn: 'writeFile', args: [path.join(mountPath, '/x'), 'buffer \u00bd + \u00bc = \u00be test']}]
          );
          
        });

      }); // describe parse


      describe('Server.validate validation', function () {


        var validRPCObj = {fn: 'mkdir', args: [path.join(mountPath, '/x')]};

        it('should have validate function', function () {
          assert.isFunction(FSRPC.Server.validate);
        });


        it('should return an error if function name rpc.fn is not set in config', function () {
          var actual;

          actual = FSRPC.Server.validate(
            {args: []}, 
            validatorConfig, 
            mountPath
          );
          
          assert.instanceOf(actual, Error);

          actual = FSRPC.Server.validate(
            {fn: 'unsupportedFunction', args: []},
            validatorConfig, 
            mountPath
          );
          
          assert.instanceOf(actual, Error);

        });


        it('should return null for function names set in config', function () {
          var actual;
          actual = FSRPC.Server.validate(validRPCObj, validatorConfig, mountPath);
          assert.equal(actual, null);
        });


        it('should validate argument data types', function () {

          var actual;

          actual = FSRPC.Server.validate({fn: 'mkdir'}, validatorConfig, mountPath);
          assert.instanceOf(actual, Error);

          actual = FSRPC.Server.validate({fn: 'mkdir', args: [true]}, validatorConfig, mountPath);
          assert.instanceOf(actual, Error);

        });


        it('should validate path arguments', function () {

          var actual;

          // with valid paths
          actual = FSRPC.Server.validate(validRPCObj, validatorConfig, mountPath);
          assert.equal(actual, null);

          actual = FSRPC.Server.validate(validRPCObj.rpc, validatorConfig, '/');
          assert.instanceOf(actual, Error);

          actual = FSRPC.Server.validate(validRPCObj, validatorConfig, '/invalid/path');

          actual = FSRPC.Server.validate({fn: 'mkdir', args: ['/a/..']}, validatorConfig, '/');
          assert.equal(actual, null);

          actual = FSRPC.Server.validate({fn: 'mkdir', args: ['/a/.']}, validatorConfig, '/');
          assert.equal(actual, null);

          actual = FSRPC.Server.validate({fn: 'mkdir', args: ['/a/..']}, validatorConfig, '/a');
          assert.instanceOf(actual, Error);

        });

      }); // describe validation


      describe('Server.execute', function () {

        it('should have execution function', function () {
          assert.isFunction(FSRPC.Server.execute);
        });


        it('should return error on executing undefined function', function (done) {

          FSRPC.Server.execute(rpcFS, [{fn: 'undefinedFunction'}], function (err) {  
            assert.instanceOf(err, Error);
            done();
          });

        });


        it('should execute rpc on rpcFS', function (done) {

          async.series([
            
              function (next) {
                FSRPC.Server.execute(rpcFS, 
                  [{fn: 'stat', args: path.join(mountPath, 'dirA')}], 
                  function (err, resultList) {                  
                    assert.isNull(err, 'should not have an error');
                    assert.isArray(resultList, 'resultList should be an array');
                    assert.equal(resultList.length, 1);
                    assert.isArray(resultList[0]);
                    assert.isNull(resultList[0][0]);
                    next();              
                  }
                );
              },

              function (next) {
                FSRPC.Server.execute(rpcFS, 
                  [{fn: 'mkdir', args: path.join(mountPath, 'dirA')}], 
                  function (err, resultList) {
                    assert.isNull(err, 'should not have an error');
                    assert.instanceOf(resultList[0][0], Error, 'first result should have an error');
                    next();              
                  }
                );
              },

              function (next) {
                FSRPC.Server.execute(rpcFS, 
                  [{fn: 'readdirStat', args: path.join(mountPath, 'dirA')}], 
                  function (err, resultList) {
                    assert.isObject(resultList[0][1]);
                    assert.isObject(resultList[0][1].fileA);
                    next();              
                  }
                );
              },

              function (next) {
                FSRPC.Server.execute(rpcFS, 
                  [{fn: 'readdirStat', args: path.join(mountPath, 'notExistingDirectory')}], 
                  function (err, resultList) {
                    assert.instanceOf(resultList[0][0], Error);
                    next();              
                  }
                );
              }
            ], 
            done
          );  // async series

        }); // execute rpc on rpcFS
        
      }); // describe Server.execute

      
      describe('Server.stringify', function () {

        it('should stringify exec results', function (done) {

          var rpcList = [
              {fn: 'stat', args: [path.join(mountPath, 'dirX')]},
              {fn: 'readdirStat', args: [path.join(mountPath, 'dirY')]},
              {fn: 'readFile', args: [path.join(mountPath,'file0'), {encoding: 'base64'}]},
              {fn: 'someFn', args: []},
              {fn: 'someFn', args: []}
            ],
            resultList = [
              [null,{size: 123}],
              [null,{dirY: {size: 456}}],
              [null,fsExtra.readFileSync(path.join(mountPath,'file0'), {encoding: 'base64'})],
              [new Error('msg')],
              [null, new Buffer('buffer \u00bd + \u00bc = \u00be test')]
            ],
            actual = FSRPC.Server.stringify(rpcList, resultList),
            expected = '['
              + '{"data":[null,{"size":123}]}'
              + ',{"data":[null,{"dirY":{"size":456}}]}'
              + ',{"data":[null,"ZmlsZTAgY29udGVudA=="]}'
              + ',{"data":[{}],"error":{"name":"Error","message":"msg"}}'
              + ',{"data":[null,"YnVmZmVyIMK9ICsgwrwgPSDCviB0ZXN0"],"buffers":[1]}'
              + ']';

          assert.strictEqual(actual, expected);

          done();
        });

      }); // Server.stringify
    
    }); // describe FSRPC.Server static functions

  }); // describe FSRPC.Server

}); // describe fs-rpc module


