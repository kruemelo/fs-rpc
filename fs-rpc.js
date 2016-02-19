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
  

  FSRPC.Client = {};

  /*
  * static Client.parse
  * str: '{"data":[null,"YnVmZmVyIMK9ICsgwrwgPSDCviB0ZXN0"],"error":{"name":"Error","message":"msg"}}'
  * returns: [Error,data1,data2,..]
  */
  FSRPC.Client.parse = function (str) {

    var jsonParsed,
      parsedResult = [];      

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
            parsedResult = jsonParsed.data;
          }
        
        }
      }
    }
    catch (err) {    
      parsedResult[0] = err;
    }

    return parsedResult;
  };  // FSRPC.Client.parse result str


  FSRPC.Client.stringify = function (fn, args) {

    var rpc = {
        fn: fn,
        args: []
      };

    if (undefined !== args ) {
    
      if (!Array.isArray(args)) {
        args = [args];
      }

      // add arguments
      rpc.args = args;
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
      rpcObj = FSRPC.Server.parse(strReqRPC, validatorConfig);

      
      if (rpcObj && 'object' === typeof rpcObj) {

        // extend paths
        FSRPC.Server.extendPaths(rpcObj, validatorConfig, mountPath);
      
        // validate
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

  
  FSRPC.Server.parse = function (rpcStr, validatorConfig) {

    var rpcObj;

    try {
      rpcObj = JSON.parse(rpcStr);
    }
    catch (err) {}

    if (!rpcObj || 
        'object' !== typeof rpcObj || 
        'string' !== typeof rpcObj.fn || 
        !validatorConfig[rpcObj.fn]
      ) {
      rpcObj = null;
    }

    return rpcObj;
  };  // Server parse rpc string


  FSRPC.Server.extendPaths = function (rpcObj, validatorConfig, mountPath) {

    var path = require('path'),
      validator;

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
  };


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
