(function(definition) {
    if (typeof module !== 'undefined') {
      module.exports = definition();
    }
    else if (typeof define === 'function' && typeof define.amd === 'object') {
      define(definition);
    }
    else if (typeof window === 'object') {
      window.FSRPC = definition;
    }
}(function () {

  'use strict';

  var FSRPC = {};

  FSRPC.stringToArrayBuffer = function (str) {
    var buffer = new ArrayBuffer(str.length * 2), // 2 bytes for each char
      bufView = new Uint16Array(buffer),
      strLength = str.length,
      i = 0;
    for (; i < strLength; ++i) {
      bufView[i] = str.charCodeAt(i);
    }
    return buffer;
  };

  FSRPC.arrayBufferToString = function (buf) {
    return String.fromCharCode.apply(null, new Uint16Array(buf));
  };


  FSRPC.Client = function () {
    return new Client();
  };


  var Client = function () {
    this.rpcList = [];
  };


  Client.prototype.add = function (fn, args) {
    this.rpcList.push({
      fn: fn,
      args: args
    });
    return this;
  };  // Client add rpc


  Client.prototype.stringify = function () {

    var list = [];

    this.rpcList.forEach(function (listRPC) {

      var rpc = {
          fn: listRPC.fn,
          args: []
        },
        args = listRPC.args;

      if (undefined !== args ) {
      
        if (!Array.isArray(args)) {
          args = [args];
        }

        if (args.length) {
          // add arguments
          args.forEach(function (arg) {
            if (arg instanceof ArrayBuffer) {
              rpc.args.push(FSRPC.arrayBufferToString(arg));
            }
            else {
              rpc.args.push(arg);
            }
          });        
        }
      }

      list.push(rpc);
    });

    return JSON.stringify(list);
  };  // Client stringify rpc list


  Client.prototype.parse = function (resultListStr) {

    var jsonParsed,
      parsedResultList,
      atob = atob || function (str) {return (new Buffer(str,'base64')).toString();};

    try {
      
      jsonParsed = JSON.parse(resultListStr);

      if (Array.isArray(jsonParsed)) {

        parsedResultList = [];
        jsonParsed.forEach(function (rpcResult) {

          var parsedResult = [],
            error;

          if (rpcResult && Array.isArray(rpcResult.data)) {

            if ('object' === typeof rpcResult.error) {
              error = new Error(rpcResult.error.message);
              error.name = rpcResult.error.name;
              parsedResult.push(error);
            }
            else {
              rpcResult.data.forEach(function (value, valueIndex) {
                if (value && rpcResult.buffers && -1 !== rpcResult.buffers.indexOf(valueIndex)) {             
                  parsedResult.push(FSRPC.stringToArrayBuffer(atob(String(value))));
                }
                else {
                  parsedResult.push(value);
                }
              });
            }
          
          }
          else {
            parsedResult.push(rpcResult);
          }

          parsedResultList.push(parsedResult);
        });
      }
    }
    catch (err) {
      // console.log(err);      
      parsedResultList = null;
    }

    return parsedResultList;
  };  // Client parse result list


  FSRPC.Server = function (validatorConfig, parsedCallback) {

    var requestHandler = function (req, res, next) {

      var reqData = req.body && req.body.data ? req.body.data : undefined,
        strReqRPC = 'object' === typeof reqData ? reqData.fsrpc : undefined,  
        mountPath = req.mountPath,
        validationError = null,
        rpcList;

      if (!strReqRPC || !mountPath) {
        next();
        return;
      }

      // parse
      rpcList = FSRPC.Server.parse(strReqRPC, validatorConfig, mountPath);
      
      // validate
      if (Array.isArray(rpcList)) {
      
        rpcList.some(function (rpcObj) {
          validationError = FSRPC.Server.validate(rpcObj, validatorConfig, mountPath);
          return !!validationError;
        });

        if ('function' === typeof parsedCallback) {
          parsedCallback(validationError, rpcList, req, res, next);
          return;
        }
      }

      next(validationError);

    };  // requestHandler

    return requestHandler;
  };  // Server

  
  FSRPC.Server.parse = function (rpcListStr, validatorConfig, mountPath) {

    var rpcList,
      path = require('path'),
      result = [];

    try {
      rpcList = JSON.parse(rpcListStr);
    }
    catch (err) {}

    if (!Array.isArray(rpcList)) {
      return null;
    }

    rpcList.forEach(function (rpcObj) {

      var  validator = validatorConfig[rpcObj.fn];

      if (!validator) {
        rpcList.push(null);
        return;
      }

      // extend paths with mount path
      validator.forEach(function (argValidator, argIndex) {
        if (argValidator.isPath && 'string' === typeof rpcObj.args[argIndex] ) {
          rpcObj.args[argIndex] = path.join(mountPath, rpcObj.args[argIndex]);
        }
      });

      result.push(rpcObj);

    });

    return result;
  };  // Server parse rpc list string


  FSRPC.Server.validate = function (rpcObj, validatorConfig, mountPath) {

    var fn,
      args,
      validator,
      error = null,
      path = require('path');

    if (!rpcObj || 'object' !== typeof rpcObj) {      
      return new Error('EINVALIDARGUMENT');
    }

    args = rpcObj.args || [];
    fn = rpcObj.fn;

    // validate for supported function name
    validator = validatorConfig[fn];
    if (!validator) {
      return new Error('EINVALIDARGUMENT');
    }

    // validate arguments
    validator.some(function (argValidator, argIndex) {

      var arg = args[argIndex],
        required = -1 === argValidator.dataTypes.indexOf('undefined');

      // check if not required
      if (undefined === arg && required) {
        error = new Error('EMISSINGARGUMENT');
        // exit validator
        return true;
      }

      // check for valid data types
      if (-1 === argValidator.dataTypes.indexOf(typeof arg)) {
        error = new Error('EINVALIDARGTYPE');
        // exit validator
        return true;
      }

      // check for valid paths
      if (!argValidator.isPath) {
        return;
      }

      if (0 !== path.normalize(arg).indexOf(mountPath)) {
        error = new Error('EINVALIDPATH');
        // exit validator
        return true;        
      }

    });

    return error;
  };  // Server validate rpcObj


  FSRPC.Server.eachAsync = function (list, yieldCallback, done) {
      
    var GeneratorFunction = (new Function('return Object.getPrototypeOf(function*(){}).constructor'))(),
      iterFn = new GeneratorFunction(
        'list', 
        'fn',
        'callback',
        'done',
        'function cb (e){setTimeout(function(){callback(e);},1);}for(var i=0;i<list.length;++i){yield fn(list[i],cb);} done();'
      );

    var iter = iterFn(list, yieldCallback, done, function (err) {
      if (err instanceof Error) {
        done(err);
      }
      else {
        iter.next();          
      }
    });
    
    iter.next();

    return;
  };


  FSRPC.Server.execute = function (fs, rpcList, executeCallback) {

    var resultList = [],
      error = null;

    FSRPC.Server.eachAsync(

      rpcList, 

      function (rpcObj, rpcObjDone) {

        var fn, args;
        
        function rpcCallback () {   
          resultList.push(Array.prototype.slice.call(arguments));
          rpcObjDone(error);
        }

        if ('object' !== typeof rpcObj) {
          rpcObjDone();
          return;
        }

        fn = fs[rpcObj.fn];
        args = rpcObj.args || [];

        if (!Array.isArray(args)) {
          args = [args];
        }          

        args = args.concat(rpcCallback);     

        if ('function' !== typeof fn) {
          error = new Error('EINVALIDFUNCTION');
          resultList.push([error]);
          rpcObjDone(error);
          return;
        } 

        try {
          fn.apply(fs, args);          
        }
        catch (err) {
          error = err;
          resultList.push([error]);
          rpcObjDone(error);
        }
      },

      function (err) {
        executeCallback(err, resultList);
      }

    );

    return;
  };  // Server execute rpc list


  FSRPC.Server.stringify = function (rpcList, resultList) {

    var list = [];
      
    rpcList.forEach(function (rpc, rpcIndex) {

      var rpcResult = {data: []},
        execResults = resultList[rpcIndex];

      if (Array.isArray(execResults)) {
        // an exec result      
        execResults.forEach(function (execResult, execResultIndex) {
          if (0 === execResultIndex && execResult instanceof Error) {
            // new Error('message') > "Error: message"
            rpcResult.data.push(execResult);
            rpcResult.error = {name: execResult.name, message: execResult.message};            
          }
          else if (execResult instanceof Buffer) {
            rpcResult.data.push(execResult.toString('base64'));
            if (!rpcResult.buffers) {
              rpcResult.buffers = [];
            }
            rpcResult.buffers.push(execResultIndex);
          }
          else {
            rpcResult.data.push(execResult);            
          }
        });
      }
      else {
        // not an exec result
        rpcResult.data.push(execResults);
      }

      list.push(rpcResult);
    });

    return JSON.stringify(list);    
  };  // Server stringify result list

  return FSRPC;

}));
