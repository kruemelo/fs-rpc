// $ npm test
// $ ./node_modules/.bin/mocha -w

/*
workflow:

client:
  - RPC = FSRPC.Client
  - rpc = RPC.stringify(fn, args)
  - xhr.send(rpc) -> server

server:
  - express app: app = express();
  -- bodyParser = require('body-parser');
  -- app.use(bodyParser.json({limit: '6mb'}));
  -- app.use('/', router);
  - router: router = express.Router();
  -- FSRPC = require('fs-rpc');
  -- RPC = FSRPC.Server;
  -- router.post('/rpc', function (req, res, next)
  --- req.mountPath = req.app.fsMountPath;
  -- router.use(RPC(validatorConfig, fnRequesHandler));
  -- fnRequestHandler(validationError, rpc, req, res, next)
  --- RPC.execute(RPCFS, rpc, function (err, result) {
  ---- res.end(RPC.stringify([err, result])); -> client       

client:
  - RPC = FSRPC.Client
  - xhr.done: parsed = RPC.parse(result);
  - result: [err, ..resultValues]
*/

var assert = require('chai').assert;
var FSRPC = require('./fs-rpc.js');
var fsExtra = require('fs-extra');
var rpcFS = require('rpc-fs');
var path = require('path');
var os = require('os');
var async = require('async');

function base64 (utf8Str) {
  return (new Buffer(utf8Str)).toString('base64');
}

/*global assert */
/* //global console */
describe('fs-rpc module', function () {

  it('should have loaded module', function () {
    assert.isObject(FSRPC, 'FSRPC should be object');
  });

  describe('FSRPC.Client', function () {

    // it('should convert to and from ArrayBuffer', function () {

    //   var testStr = 'buffer \u00bd + \u00bc = \u00be test',
    //     buffer,
    //     toStr;

    //   assert.isFunction(FSRPC.Client.stringToArrayBuffer, 'stringToArrayBuffer');
    //   assert.isFunction(FSRPC.Client.arrayBufferToString, 'arrayBufferToString');

    //   buffer = FSRPC.Client.stringToArrayBuffer(testStr);

    //   assert.instanceOf(buffer, ArrayBuffer);
    //   assert.strictEqual(buffer.byteLength, 21);

    //   toStr = FSRPC.Client.arrayBufferToString(buffer);

    //   assert.strictEqual(toStr, testStr);
    // });

    it('should have a client constructor', function () {

      var fsrpc;

      assert.isFunction(FSRPC.Client);

      fsrpc = new FSRPC.Client();
      assert.isObject(fsrpc);
    });


    var clientTests = [
      {
        rpc: {fn: 'mkdir', args: '/a'},
        rpcStr: '{"fn":"mkdir","args":["/a"]}'
      },
      {
        rpc: {fn: 'readdir', args: ['/']},
        rpcStr: '{"fn":"readdir","args":["/"]}'
      },
      {
        rpc: {fn: 'open', args: ['/newFile', 'w', 0666]},
        rpcStr: '{"fn":"open","args":["/newFile","w",438]}'
      },
      {
        rpc: {fn: 'write', args: [1, 'test data', 0, 'utf8']},
        rpcStr: '{"fn":"write","args":[1,"test data",0,"utf8"]}'
      },
      {
        rpc: {fn: 'writeFile', args: ['/A', 'buffer \u00bd + \u00bc = \u00be test']},
        rpcStr: '{"fn":"writeFile","args":["/A","buffer ½ + ¼ = ¾ test"]}'
      }
    ];

    describe('Client.stringify remote procedure call', function ()  {
      

      it('should have a stringify function', function () {
        assert.isFunction(FSRPC.Client.stringify);
      });


      it('should generate correct rpc-string', function () {

        clientTests.forEach(function (test) {          
          assert.equal(
            FSRPC.Client.stringify(test.rpc.fn, test.rpc.args), 
            test.rpcStr, 
            'stringified'
          );
        });

      });

    }); // describe stringify calls

    // describe('Client atob', function () {

    //   it('should decode base64 encoded UTF8-Strings to 16-bit DOMStrings', function () {

    //     assert.isFunction(FSRPC.Client.atob);

    //     // tests node context only
    //     assert.strictEqual(
    //       FSRPC.Client.atob('wr0gKyDCvCA9IMK+'),
    //       '½ + ¼ = ¾',
    //       'to DOMStrings'
    //     );

    //   });

    // });

    describe('static Client.parse', function () {

      it('should have a parse function', function () {
        assert.isFunction(FSRPC.Client.parse);
      });

      it('should parse rpc results', function () {
        
        var parsed;

        parsed = FSRPC.Client.parse('{"data":[null,{"size":123}]}');
        assert.isArray(parsed);
        assert.strictEqual(parsed.length, 2);
        assert.equal(parsed[0], null);
        assert.equal(parsed[1].size, 123);
        
        parsed = FSRPC.Client.parse('{"data":[null,{"dirY":{"size":456}}]}');
        assert.equal(parsed[1].dirY.size, 456);

        parsed = FSRPC.Client.parse('{"data":[null,"ZmlsZTAgY29udGVudA=="]}');
        assert.equal(parsed[1], 'ZmlsZTAgY29udGVudA==');
        
        parsed = FSRPC.Client.parse('{"data":[{}],"error":{"name":"Error","message":"msg"}}');
        assert.instanceOf(parsed[0], Error);
        
      });

    }); // describe static Client.parse

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
      });

    });

    describe('FSRPC.Server static functions', function () {

      describe('Server.parse rpc-strings', function () {

        it('should parse rpc-strings', function () {

          var actual;
    
          assert.isFunction(FSRPC.Server.parse);

          assert.deepEqual(
            FSRPC.Server.parse(
              'invalid json string', 
              validatorConfig, 
              mountPath
            ), 
            null,
            'invalid json string'
          );

          assert.deepEqual(FSRPC.Server.parse(
            '{"fn":"unsupportedFunction","args":[]}', 
            validatorConfig, 
            mountPath
          ), null);


          actual = FSRPC.Server.parse(
            FSRPC.Client.stringify('mkdir', '/x'), 
            validatorConfig, 
            mountPath
          );      

          assert.deepEqual(
            actual, 
            {fn: 'mkdir', args: [path.join(mountPath, '/x')]}
          );

          actual = FSRPC.Server.parse(
            FSRPC.Client.stringify('writeFile', ['/x', base64('buffer \u00bd + \u00bc = \u00be test')]), 
            validatorConfig, 
            mountPath
          );

          assert.deepEqual(
            actual, 
            {fn: 'writeFile', args: [path.join(mountPath, '/x'), 'YnVmZmVyIMK9ICsgwrwgPSDCviB0ZXN0']}
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
                  {fn: 'stat', args: path.join(mountPath, 'dirA')}, 
                  function (err, stats) {                  
                    assert.isNull(err, 'should not have an error');
                    assert.isObject(stats, 'result should be an object');
                    next();              
                  }
                );
              },

              function (next) {
                FSRPC.Server.execute(rpcFS, 
                  {fn: 'mkdir', args: path.join(mountPath, 'dirA')}, 
                  function (err) {
                    assert.instanceOf(err, Error, 'first result should have an error');
                    next();              
                  }
                );
              },

              function (next) {
                FSRPC.Server.execute(rpcFS, 
                  {fn: 'readdirStat', args: path.join(mountPath, 'dirA')}, 
                  function (err, dirStats) {
                    assert.isNull(err, 'should not have an error');
                    assert.isObject(dirStats);
                    assert.isObject(dirStats.fileA);
                    next();              
                  }
                );
              },

              function (next) {
                FSRPC.Server.execute(rpcFS, 
                  {fn: 'readdirStat', args: path.join(mountPath, 'notExistingDirectory')}, 
                  function (err) {
                    assert.instanceOf(err, Error);
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

          var expected = [
              '{"data":[null,{"size":123}]}',
              '{"data":[null,{"dirY":{"size":456}}]}',
              '{"data":[null,"ZmlsZTAgY29udGVudA=="]}',
              '{"data":[{}],"error":{"name":"Error","message":"msg"}}',
              '{"data":[null,"YnVmZmVyIMK9ICsgwrwgPSDCviB0ZXN0"]}'
            ];

          [
            [null, {size: 123}],
            [null, {dirY: {size: 456}}],
            [null, fsExtra.readFileSync(path.join(mountPath,'file0'), {encoding: 'base64'})],
            [new Error('msg')],
            [null, base64('buffer \u00bd + \u00bc = \u00be test')]
          ].forEach(function (rpc, index) {
            var actual = FSRPC.Server.stringify(rpc);
            assert.strictEqual(actual, expected[index]);            
          });

          done();
        });

      }); // Server.stringify
    
    }); // describe FSRPC.Server static functions


    describe('use as an express middleware', function () {

      it('should handle request', function (done) {

        var server;

        function parsedCallback (validationError, rpc, req, res, next) {
          assert.isNull(validationError);
          assert.isObject(req, 'req');
          assert.isObject(res, 'res');
          assert.isFunction(next, 'next');
          assert.strictEqual(req.mountPath, mountPath, 'req.mountPath');
          assert.deepEqual(
            rpc, 
            {
              fn: 'writeFile', 
              args: [
                path.join(mountPath, '/A'), 
                'buffer \u00bd + \u00bc = \u00be test'
              ]
            }
          );
          done();
        }

        server = new FSRPC.Server(validatorConfig, parsedCallback);

        assert.isFunction(server, 'server constructor should return a function');

        server(
          // req
          {
            body: {
              data: '{"fn":"writeFile","args":["/A","buffer ½ + ¼ = ¾ test"]}'
            },
            // expects mount path to be set in req
            mountPath: mountPath
          },
          // res
          {},
          //next
          function () {
          }
        );

      }); // handle request

    }); // describe use as an express middleware

  }); // describe FSRPC.Server

}); // describe fs-rpc module


