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

    try {
      return String.fromCharCode.apply(null, new Uint16Array(buf));
    }
    catch (e) {
      // Uint16Array not a valid argument for String.fromCharCode.apply
      // This is due to a bug in PhantomJS: See https://github.com/ariya/phantomjs/issues/11172
      // workaround:
      var dataArray = [],
        byteLength = buf.byteLength,
        i = 0;

      for (; i < byteLength; ++i) {
          dataArray.push(buf[i]);
      }
      return String.fromCharCode.apply(null, dataArray);
    }

  };


  FSRPC.Client = function (fn, args) {
    return new Client(fn, args);
  };


  var Client = function (fn, args) {
    this.fn = fn;
    this.args = Array.isArray(args) ? 
      args : [args];
  };


  /*
  * static Client.parse
  * str: '{"data":[null,"YnVmZmVyIMK9ICsgwrwgPSDCviB0ZXN0"],"buffers":[1],"error":{"name":"Error","message":"msg"}}'
  * returns: [Error,data1,data2,..]
  */
  FSRPC.Client.parse = function (str) {

    var jsonParsed,
      parsedResult = [],
      atob = atob || function (str) {return (new Buffer(str,'base64')).toString();};

    try {
      
      jsonParsed = JSON.parse(str);

      if ('object' === typeof jsonParsed) {

        var error;

        if (jsonParsed && Array.isArray(jsonParsed.data)) {

          if ('object' === typeof jsonParsed.error) {
            error = new Error(jsonParsed.error.message);
            error.name = jsonParsed.error.name;
            parsedResult.push(error);
          }
          else {
            jsonParsed.data.forEach(function (value, valueIndex) {
              if (value && jsonParsed.buffers && -1 !== jsonParsed.buffers.indexOf(valueIndex)) {             
                parsedResult.push(FSRPC.stringToArrayBuffer(atob(String(value))));
              }
              else {
                parsedResult.push(value);
              }
            });
          }
        
        }
      }
    }
    catch (err) {    
      parsedResult[0] = err;
    }

    return parsedResult;
  };  // FSRPC.Client.parse result str


  Client.prototype.stringify = function () {

    var rpc = {
        fn: this.fn,
        args: []
      },
      args = this.args;

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

    return JSON.stringify(rpc);

  };  // Client stringify rpc 


  FSRPC.Server = function (validatorConfig, parsedCallback) {

    // returns a connect/express request handler fn
    var requestHandler = function (req, res, next) {

      var strReqRPC = req.body && req.body.data ? req.body.data : undefined,
        mountPath = req.mountPath,
        validationError = null,
        rpcObj;

      if (!strReqRPC || !mountPath) {
        next();
        return;
      }

      // parse
      rpcObj = FSRPC.Server.parse(strReqRPC, validatorConfig, mountPath);
      
      // validate
      if (rpcObj && 'object' === typeof rpcObj) {
      
        validationError = FSRPC.Server.validate(rpcObj, validatorConfig, mountPath);

        if ('function' === typeof parsedCallback) {
          parsedCallback(validationError, rpcObj, req, res, next);
          return;
        }
      }

      next(validationError);

    };  // requestHandler

    return requestHandler;
  };  // Server

  
  FSRPC.Server.parse = function (rpcStr, validatorConfig, mountPath) {

    var rpcObj,
      path = require('path'),
      validator;

    try {
      rpcObj = JSON.parse(rpcStr);
    }
    catch (err) {}

    if (!rpcObj || 'object' !== typeof rpcObj || 'string' !== typeof rpcObj.fn) {
      return null;
    }

    validator = validatorConfig[rpcObj.fn];

    if (!validator) {
      return null;
    }

    // extend paths with mount path
    validator.forEach(function (argValidator, argIndex) {
      if (argValidator.isPath && 'string' === typeof rpcObj.args[argIndex] ) {
        rpcObj.args[argIndex] = path.join(mountPath, rpcObj.args[argIndex]);
      }
    });

    return rpcObj;
  };  // Server parse rpc string


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


  FSRPC.Server.execute = function (fs, rpcObj, callback) {

    var fn, args;

    if (!rpcObj || 'object' !== typeof rpcObj) {
      callback();
      return;
    }

    fn = fs[rpcObj.fn];
    
    if ('function' !== typeof fn) {
      callback(new Error('EINVALIDFUNCTION'));
      return;
    } 

    args = rpcObj.args || [];

    if (!Array.isArray(args)) {
      args = [args];
    }          

    args = args.concat(callback);     

    try {
      fn.apply(fs, args);          
    }
    catch (err) {
      callback(err);
    }

    return;
  };  // Server execute rpc 


  FSRPC.Server.stringify = function (execResults) {

    var rpcResult = {data: []};

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

    return JSON.stringify(rpcResult);    
  };  // Server stringify result 

  return FSRPC;

}));
